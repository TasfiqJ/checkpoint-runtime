"""Automatic recovery management for the checkpoint runtime control plane.

This module provides **RecoveryManager**, which integrates with the
HeartbeatManager to detect worker failures and orchestrate the recovery
protocol:

1. Transition the affected run to FAILED.
2. Abort any in-progress checkpoints.
3. Transition through RECOVERING -> RUNNING to resume the run from the
   last committed checkpoint.

The recovery logic respects the run state machine and handles edge cases
such as runs already in a terminal state or concurrent failures.
"""

from __future__ import annotations

import logging

from controlplane.coordinator import Coordinator
from controlplane.heartbeat import HeartbeatManager
from controlplane.models import RunState
from controlplane.state_machine import InvalidTransitionError

logger = logging.getLogger(__name__)


class RecoveryManager:
    """Orchestrates automatic run recovery after worker failures.

    Parameters:
        coordinator: The Coordinator used for run/checkpoint state management.
        heartbeat_mgr: The HeartbeatManager whose failure callbacks we hook
            into to trigger automatic recovery.
        auto_recover: If True (default), automatically attempt to recover
            runs when a worker failure is detected. If False, runs are moved
            to FAILED but not automatically restarted.
    """

    def __init__(
        self,
        coordinator: Coordinator,
        heartbeat_mgr: HeartbeatManager | None = None,
        *,
        auto_recover: bool = True,
    ) -> None:
        self._coordinator = coordinator
        self._heartbeat_mgr = heartbeat_mgr
        self._auto_recover = auto_recover

        # Track runs currently being recovered to avoid re-entrant recovery
        self._recovering: set[str] = set()

        # Track which checkpoint each run should resume from
        self._recovery_checkpoints: dict[str, str | None] = {}

        # Register failure callback
        if heartbeat_mgr is not None:
            heartbeat_mgr.on_worker_failure(self._on_worker_failure)

    # -- failure handler (callback) -----------------------------------------

    def _on_worker_failure(self, worker_id: str, run_id: str) -> None:
        """Handle a worker failure notification from the heartbeat manager.

        This method is registered as a failure callback and will be invoked
        by the HeartbeatManager when a worker is declared dead.

        Note: callback receives (worker_id, run_id) to match HeartbeatManager.
        """
        logger.warning(
            "RecoveryManager notified: worker %s failed in run %s",
            worker_id, run_id,
        )

        # Avoid re-entrant recovery for the same run
        if run_id in self._recovering:
            logger.info(
                "Run %s is already being recovered, skipping duplicate trigger",
                run_id,
            )
            return

        try:
            self._handle_failure(run_id, worker_id)
        except Exception:
            logger.exception(
                "Unhandled error during failure handling for run %s (worker %s)",
                run_id, worker_id,
            )
        finally:
            self._recovering.discard(run_id)

    # -- recovery protocol --------------------------------------------------

    def _handle_failure(self, run_id: str, worker_id: str) -> None:
        """Execute the failure-handling protocol for a run.

        Steps:
        1. Transition run to FAILED (if valid).
        2. Abort any in-progress checkpoints for the run.
        3. If auto_recover is enabled, transition FAILED -> RECOVERING -> RUNNING.
        """
        self._recovering.add(run_id)

        status = self._coordinator.get_run(run_id)
        if status is None:
            logger.error("Run %s not found during failure handling", run_id)
            return

        # If the run is already in a terminal state, nothing to do
        if status.state in (RunState.CANCELLED, RunState.COMPLETED):
            logger.info(
                "Run %s is in terminal state %s, skipping recovery",
                run_id, status.state.value,
            )
            return

        # If the run is already FAILED, skip to recovery
        if status.state == RunState.FAILED:
            logger.info("Run %s is already FAILED", run_id)
        else:
            # Transition to FAILED
            try:
                self._coordinator.transition_run(run_id, RunState.FAILED)
                logger.info(
                    "Run %s transitioned to FAILED (was %s)", run_id, status.state.value,
                )
            except InvalidTransitionError:
                logger.warning(
                    "Cannot transition run %s from %s to FAILED",
                    run_id, status.state.value,
                )
                return

        # Abort in-progress checkpoints
        self._abort_pending_checkpoints(run_id)

        # Attempt automatic recovery
        if self._auto_recover:
            self._attempt_recovery(run_id)

    def _abort_pending_checkpoints(self, run_id: str) -> None:
        """Mark all non-committed checkpoints for the run as FAILED."""
        checkpoints = self._coordinator.list_checkpoints(run_id)
        for cp in checkpoints:
            if cp.state in ("PENDING", "IN_PROGRESS"):
                try:
                    self._coordinator.update_checkpoint_state(cp.checkpoint_id, "FAILED")
                    logger.info(
                        "Aborted checkpoint %s (was %s) for run %s",
                        cp.checkpoint_id, cp.state, run_id,
                    )
                except Exception:
                    logger.exception(
                        "Failed to abort checkpoint %s for run %s",
                        cp.checkpoint_id, run_id,
                    )

    def _attempt_recovery(self, run_id: str) -> None:
        """Attempt to transition a FAILED run through RECOVERING to RUNNING.

        If the transition fails at any point, the run remains in its current
        state and manual intervention may be required.
        """
        try:
            self._coordinator.transition_run(run_id, RunState.RECOVERING)
            logger.info("Run %s transitioned to RECOVERING", run_id)
        except (InvalidTransitionError, KeyError) as exc:
            logger.warning(
                "Cannot begin recovery for run %s: %s", run_id, exc,
            )
            return

        try:
            self._coordinator.transition_run(run_id, RunState.RUNNING)
            logger.info(
                "Run %s recovered successfully and is now RUNNING", run_id,
            )
        except (InvalidTransitionError, KeyError) as exc:
            logger.error(
                "Failed to complete recovery for run %s: %s", run_id, exc,
            )

    # -- execute recovery (async API) ---------------------------------------

    async def _execute_recovery(self, run_id: str) -> None:
        """Execute the recovery protocol for a run (async entry point).

        Finds the latest committed checkpoint for the run, records it
        as the recovery target, and ensures the run is in RUNNING state.
        """
        status = self._coordinator.get_run(run_id)
        if status is None:
            logger.error("Run %s not found during recovery execution", run_id)
            return

        # Find the latest committed checkpoint
        checkpoints = self._coordinator.list_checkpoints(run_id)
        committed = [cp for cp in checkpoints if cp.state == "COMMITTED"]

        if committed:
            latest = committed[-1]
            self._recovery_checkpoints[run_id] = latest.checkpoint_id
            logger.info(
                "Recovery for run %s will resume from checkpoint %s (step %d)",
                run_id, latest.checkpoint_id, latest.step,
            )
        else:
            self._recovery_checkpoints[run_id] = None
            logger.info(
                "No committed checkpoints found for run %s, starting fresh",
                run_id,
            )

        # Ensure the run is in RUNNING state (it may already be)
        if status.state != RunState.RUNNING:
            logger.info(
                "Run %s is in state %s, not transitioning during recovery",
                run_id, status.state.value,
            )

    def get_recovery_checkpoint(self, run_id: str) -> str | None:
        """Return the checkpoint ID to resume from for a recovered run.

        Returns None if no committed checkpoint was found during recovery.
        """
        return self._recovery_checkpoints.get(run_id)

    # -- manual recovery API ------------------------------------------------

    def recover_run(self, run_id: str) -> bool:
        """Manually trigger recovery for a FAILED run.

        Returns True if recovery succeeded (run is now RUNNING), False otherwise.
        """
        status = self._coordinator.get_run(run_id)
        if status is None:
            logger.error("Run %s not found for manual recovery", run_id)
            return False

        if status.state != RunState.FAILED:
            logger.warning(
                "Cannot recover run %s: current state is %s (expected FAILED)",
                run_id, status.state.value,
            )
            return False

        self._abort_pending_checkpoints(run_id)

        try:
            self._coordinator.transition_run(run_id, RunState.RECOVERING)
            self._coordinator.transition_run(run_id, RunState.RUNNING)
            logger.info("Run %s manually recovered to RUNNING", run_id)
            return True
        except (InvalidTransitionError, KeyError) as exc:
            logger.error("Manual recovery failed for run %s: %s", run_id, exc)
            return False
