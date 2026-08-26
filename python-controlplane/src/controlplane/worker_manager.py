"""Worker lifecycle management for the checkpoint runtime control plane.

This module provides **WorkerManager**, a higher-level abstraction on top of
the Coordinator and HeartbeatManager that handles:

- Worker registration with automatic rank assignment.
- Heartbeat forwarding (coordinator persistence + lease renewal).
- Deregistration and cleanup.
- Querying workers by run or globally.
- Integration with the HeartbeatManager failure callback system.
"""

from __future__ import annotations

import contextlib
import logging

from controlplane.coordinator import Coordinator
from controlplane.heartbeat import HeartbeatManager
from controlplane.models import WorkerInfo

logger = logging.getLogger(__name__)


class WorkerManager:
    """Manages the full lifecycle of workers across training runs.

    Parameters:
        coordinator: The Coordinator used for persistent worker storage.
        heartbeat_mgr: The HeartbeatManager used for lease tracking and
            failure detection.
    """

    def __init__(
        self,
        coordinator: Coordinator,
        heartbeat_mgr: HeartbeatManager | None = None,
    ) -> None:
        self._coordinator = coordinator
        self._heartbeat_mgr = heartbeat_mgr

        # In-memory index: worker_id -> WorkerInfo (for fast lookups)
        self._workers: dict[str, WorkerInfo] = {}
        # run_id -> set of worker_ids
        self._run_workers: dict[str, set[str]] = {}
        # run_id -> next rank counter
        self._rank_counters: dict[str, int] = {}

        # Register ourselves as a failure callback recipient
        if heartbeat_mgr is not None:
            heartbeat_mgr.on_worker_failure(self._on_worker_failure)

        self._rehydrate_workers()

    def _rehydrate_workers(self) -> None:
        """Restore persisted worker indexes after a control-plane restart.

        Worker metadata lives in the coordinator's KV store, while these
        lookup tables and heartbeat leases are intentionally in memory.  A
        fresh control-plane process must rebuild the in-memory side before
        existing workers send their next heartbeat; otherwise every heartbeat
        is rejected as coming from an unknown worker forever.
        """
        restored = 0
        for worker in self._coordinator.list_workers():
            self._workers[worker.worker_id] = worker
            self._run_workers.setdefault(worker.run_id, set()).add(worker.worker_id)
            self._rank_counters[worker.run_id] = max(
                self._rank_counters.get(worker.run_id, 0),
                worker.rank + 1,
            )

            if self._heartbeat_mgr is not None and worker.status == "ACTIVE":
                self._heartbeat_mgr.register(worker.worker_id, worker.run_id)
            restored += 1

        if restored:
            logger.info("Rehydrated %d persisted workers", restored)

    # -- registration -------------------------------------------------------

    def register_worker(
        self,
        run_id: str,
        hostname: str = "",
        metadata: dict | None = None,
        rank: int | None = None,
    ) -> WorkerInfo:
        """Register a new worker for a training run.

        Assigns an auto-incrementing rank within the run, persists via the
        coordinator, and creates a heartbeat lease.

        Returns the newly created WorkerInfo.
        """
        if rank is None:
            rank = self._next_rank(run_id)
        else:
            self._rank_counters[run_id] = max(
                self._rank_counters.get(run_id, 0),
                rank + 1,
            )

            # A restarted DDP process keeps its logical rank.  Retire any
            # earlier registration for that rank so API/UI worker counts do
            # not grow on every recovery cycle.
            for old_worker_id in list(self._run_workers.get(run_id, set())):
                old_worker = self._workers.get(old_worker_id)
                if (
                    old_worker is not None
                    and old_worker.rank == rank
                    and old_worker.status == "ACTIVE"
                ):
                    old_worker.status = "SUPERSEDED"
                    with contextlib.suppress(KeyError):
                        self._coordinator.mark_worker_dead(
                            run_id,
                            old_worker_id,
                            status="SUPERSEDED",
                        )
                    if self._heartbeat_mgr is not None:
                        self._heartbeat_mgr.unregister(old_worker_id)

        worker = self._coordinator.register_worker(
            run_id=run_id,
            rank=rank,
            hostname=hostname,
        )

        # Update in-memory index
        self._workers[worker.worker_id] = worker
        self._run_workers.setdefault(run_id, set()).add(worker.worker_id)

        # Register heartbeat lease
        if self._heartbeat_mgr is not None:
            self._heartbeat_mgr.register(worker.worker_id, run_id)

        logger.info(
            "Registered worker %s (rank %d, host=%s) for run %s",
            worker.worker_id,
            rank,
            hostname,
            run_id,
        )
        return worker

    def deregister_worker(self, worker_id: str) -> None:
        """Remove a worker from tracking and heartbeat monitoring.

        Keeps the coordinator record for history but persists it as DEAD so a
        future control-plane process cannot rehydrate a departed worker.
        """
        worker = self._workers.get(worker_id)
        if worker is not None:
            worker.status = "DEREGISTERED"
            run_workers = self._run_workers.get(worker.run_id)
            if run_workers:
                run_workers.discard(worker_id)
            with contextlib.suppress(KeyError):
                self._coordinator.mark_worker_dead(
                    worker.run_id,
                    worker_id,
                    status="DEREGISTERED",
                )

        if self._heartbeat_mgr is not None:
            self._heartbeat_mgr.unregister(worker_id)

        logger.info("Deregistered worker %s", worker_id)

    # -- heartbeat ----------------------------------------------------------

    def update_worker_heartbeat(
        self,
        worker_id: str,
        step: int = 0,
    ) -> WorkerInfo | None:
        """Process a heartbeat from a worker.

        Updates both the coordinator (persistent state) and the heartbeat
        manager (in-memory lease). Returns the updated WorkerInfo or None
        if the worker is unknown.
        """
        worker = self._workers.get(worker_id)
        if worker is None:
            logger.warning("Heartbeat from unregistered worker %s", worker_id)
            return None
        if worker.status != "ACTIVE":
            logger.warning(
                "Heartbeat from superseded worker %s (status=%s)",
                worker_id,
                worker.status,
            )
            return None

        # Update coordinator persistent state
        try:
            updated = self._coordinator.heartbeat(worker.run_id, worker_id, step)
            self._workers[worker_id] = updated
        except KeyError:
            logger.warning("Worker %s not found in coordinator during heartbeat", worker_id)
            return None

        # Propagate max step to the run so RunStatus.current_step stays current
        if step > 0:
            try:
                run_status = self._coordinator.get_run(worker.run_id)
                if run_status is not None and step > run_status.current_step:
                    self._coordinator.update_run_step(worker.run_id, step)
            except Exception:
                pass  # Don't fail heartbeat if run step update fails

        # Update heartbeat lease
        if self._heartbeat_mgr is not None:
            self._heartbeat_mgr.record_heartbeat(worker_id, step)

        return updated

    # -- queries ------------------------------------------------------------

    def get_worker(self, worker_id: str) -> WorkerInfo | None:
        """Return a tracked worker by ID, or None."""
        return self._workers.get(worker_id)

    def get_run_workers(self, run_id: str) -> list[WorkerInfo]:
        """Return all tracked workers for a given run."""
        worker_ids = self._run_workers.get(run_id, set())
        return [self._workers[wid] for wid in worker_ids if wid in self._workers]

    def list_all_workers(self) -> list[WorkerInfo]:
        """Return all tracked workers across all runs."""
        return list(self._workers.values())

    def active_worker_count(self, run_id: str) -> int:
        """Return the number of active workers for a run."""
        return sum(1 for w in self.get_run_workers(run_id) if w.status == "ACTIVE")

    # -- failure handling ---------------------------------------------------

    def _on_worker_failure(self, worker_id: str, run_id: str) -> None:
        """Handle a worker failure detected by the heartbeat manager.

        Marks the worker as DEAD in the local index. The coordinator has
        already been notified by the HeartbeatManager.

        Note: callback receives (worker_id, run_id) to match HeartbeatManager.
        """
        worker = self._workers.get(worker_id)
        if worker is not None:
            worker.status = "DEAD"
            logger.warning(
                "Worker %s (run %s) marked DEAD by failure callback",
                worker_id,
                run_id,
            )

    # -- internal helpers ---------------------------------------------------

    def _next_rank(self, run_id: str) -> int:
        """Return the next rank for a run and increment the counter."""
        rank = self._rank_counters.get(run_id, 0)
        self._rank_counters[run_id] = rank + 1
        return rank
