"""Heartbeat monitoring and worker lease management.

This module provides:
- **HeartbeatConfig**: Tunable knobs for heartbeat intervals and failure thresholds.
- **WorkerLease**: Per-worker lease tracking with expiry detection.
- **HeartbeatManager**: Background monitoring loop that detects missed heartbeats
  and invokes failure callbacks when workers are presumed dead.

The HeartbeatManager is designed to be started during the application lifespan
and integrates tightly with the Coordinator for persisting worker status.
"""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import logging
import time
from dataclasses import dataclass, field
from collections.abc import Callable
from typing import Any

from controlplane.coordinator import Coordinator

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class HeartbeatConfig:
    """Tunable heartbeat parameters.

    Supports both legacy names and new canonical names:
        interval_seconds / heartbeat_interval_seconds
        timeout_seconds / lease_ttl_seconds
        dead_threshold_seconds / failure_threshold_seconds
        monitor_poll_seconds / check_interval_seconds
    """

    interval_seconds: float = 10.0
    timeout_seconds: float = 30.0
    dead_threshold_seconds: float = 60.0
    monitor_poll_seconds: float = 5.0

    # -- aliases for test compatibility ------------------------------------

    def __init__(
        self,
        interval_seconds: float | None = None,
        timeout_seconds: float | None = None,
        dead_threshold_seconds: float | None = None,
        monitor_poll_seconds: float | None = None,
        *,
        heartbeat_interval_seconds: float | None = None,
        lease_ttl_seconds: float | None = None,
        failure_threshold_seconds: float | None = None,
        check_interval_seconds: float | None = None,
    ) -> None:
        self.interval_seconds = heartbeat_interval_seconds or interval_seconds or 10.0
        self.timeout_seconds = lease_ttl_seconds or timeout_seconds or 30.0
        self.dead_threshold_seconds = failure_threshold_seconds or dead_threshold_seconds or 60.0
        self.monitor_poll_seconds = check_interval_seconds or monitor_poll_seconds or 5.0

    @property
    def heartbeat_interval_seconds(self) -> float:
        return self.interval_seconds

    @property
    def lease_ttl_seconds(self) -> float:
        return self.timeout_seconds

    @property
    def failure_threshold_seconds(self) -> float:
        return self.dead_threshold_seconds

    @property
    def check_interval_seconds(self) -> float:
        return self.monitor_poll_seconds


# ---------------------------------------------------------------------------
# Worker lease
# ---------------------------------------------------------------------------


@dataclass
class WorkerLease:
    """Tracks heartbeat state for a single worker.

    Attributes:
        worker_id: Unique worker identifier (string).
        run_id: The run this worker belongs to.
        last_heartbeat: Monotonic timestamp of the last heartbeat.
        last_step: The training step reported in the last heartbeat.
        is_alive: Whether the worker is considered alive.
    """

    worker_id: str
    run_id: str
    last_heartbeat: float = field(default_factory=time.monotonic)
    last_step: int = 0
    is_alive: bool = True

    def touch(self, step: int = 0) -> None:
        """Record a heartbeat."""
        self.last_heartbeat = time.monotonic()
        self.last_step = step
        self.is_alive = True

    def seconds_since_heartbeat(self) -> float:
        """Return elapsed seconds since the last heartbeat."""
        return time.monotonic() - self.last_heartbeat

    @property
    def lag_seconds(self) -> float:
        """Alias for seconds_since_heartbeat (property form)."""
        return self.seconds_since_heartbeat()

    def is_expired(self, timeout: float) -> bool:
        """Return True if the worker has exceeded *timeout* seconds."""
        return self.seconds_since_heartbeat() > timeout


# ---------------------------------------------------------------------------
# Failure callback type
# ---------------------------------------------------------------------------

FailureCallback = (
    Callable[[str, str], None]            # sync: (worker_id, run_id) -> None
    | Callable[[str, str], Any]           # async: (worker_id, run_id) -> Coroutine
)


# ---------------------------------------------------------------------------
# Heartbeat manager
# ---------------------------------------------------------------------------


class HeartbeatManager:
    """Monitors worker heartbeats and detects failures.

    The manager maintains an in-memory map of WorkerLease objects and runs a
    periodic background task that checks for expired leases. When a worker
    exceeds the ``dead_threshold_seconds``, registered failure callbacks are
    invoked and the coordinator is asked to mark the worker dead.

    Parameters:
        config: HeartbeatConfig with timing parameters.
        coordinator: The Coordinator instance used to persist worker state.
    """

    def __init__(
        self,
        config: HeartbeatConfig | None = None,
        coordinator: Coordinator | None = None,
    ) -> None:
        self.config = config or HeartbeatConfig()
        self._coordinator = coordinator
        self._leases: dict[str, WorkerLease] = {}  # worker_id -> lease
        self._failure_callbacks: list[FailureCallback] = []
        self._monitor_task: asyncio.Task | None = None

    # -- public property aliases -------------------------------------------

    @property
    def workers(self) -> dict[str, WorkerLease]:
        """Alias for the internal lease map (test compatibility)."""
        return self._leases

    # -- lease management ---------------------------------------------------

    def register(self, worker_id: str, run_id: str) -> WorkerLease:
        """Create or update a lease for the given worker."""
        lease = WorkerLease(worker_id=worker_id, run_id=run_id)
        self._leases[worker_id] = lease
        logger.debug("Registered heartbeat lease for worker %s (run %s)", worker_id, run_id)
        return lease

    # Alias for test compatibility
    def register_worker(self, worker_id: str, run_id: str) -> WorkerLease:
        """Alias for register()."""
        return self.register(worker_id, run_id)

    def unregister(self, worker_id: str) -> None:
        """Remove the lease for a worker."""
        self._leases.pop(worker_id, None)
        logger.debug("Unregistered heartbeat lease for worker %s", worker_id)

    # Alias for test compatibility
    def deregister_worker(self, worker_id: str) -> None:
        """Alias for unregister()."""
        return self.unregister(worker_id)

    def record_heartbeat(self, worker_id: str, step: int = 0) -> WorkerLease | None:
        """Record a heartbeat from a worker.

        Returns the updated lease, or None if the worker is not tracked.
        """
        lease = self._leases.get(worker_id)
        if lease is None:
            logger.warning("Heartbeat from unknown worker %s (ignored)", worker_id)
            return None
        lease.touch(step)
        return lease

    # Alias for test compatibility
    def process_heartbeat(self, worker_id: str, step: int = 0) -> WorkerLease | None:
        """Alias for record_heartbeat()."""
        return self.record_heartbeat(worker_id, step)

    def get_lease(self, worker_id: str) -> WorkerLease | None:
        """Return the lease for a worker, or None."""
        return self._leases.get(worker_id)

    def get_all_leases(self) -> dict[str, WorkerLease]:
        """Return a copy of the lease map."""
        return dict(self._leases)

    # -- heartbeat lag reporting --------------------------------------------

    def get_heartbeat_lags(self) -> dict[str, float]:
        """Return a mapping of worker_id -> seconds since last heartbeat."""
        return {
            wid: round(lease.seconds_since_heartbeat(), 2)
            for wid, lease in self._leases.items()
            if lease.is_alive
        }

    # -- failure callbacks --------------------------------------------------

    def on_worker_failure(self, callback: FailureCallback) -> None:
        """Register a callback invoked when a worker is declared dead.

        The callback receives (worker_id, run_id). Supports both sync and
        async callbacks.
        """
        self._failure_callbacks.append(callback)

    async def _fire_failure_async(self, run_id: str, worker_id: str) -> None:
        """Invoke all registered failure callbacks for a dead worker (async)."""
        for cb in self._failure_callbacks:
            try:
                result = cb(worker_id, run_id)
                if inspect.isawaitable(result):
                    await result
            except Exception:
                logger.exception(
                    "Error in failure callback for worker %s (run %s)", worker_id, run_id,
                )

    def _fire_failure(self, run_id: str, worker_id: str) -> None:
        """Invoke all registered failure callbacks for a dead worker (sync)."""
        for cb in self._failure_callbacks:
            try:
                result = cb(worker_id, run_id)
                # If async, we can't await here — best effort
                if inspect.isawaitable(result):
                    logger.warning(
                        "Async failure callback used in sync context for worker %s",
                        worker_id,
                    )
            except Exception:
                logger.exception(
                    "Error in failure callback for worker %s (run %s)", worker_id, run_id,
                )

    # -- monitoring loop ----------------------------------------------------

    async def start_monitoring(self) -> None:
        """Start the background heartbeat monitoring task."""
        if self._monitor_task is not None:
            return
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info(
            "Heartbeat monitor started (poll=%.1fs, timeout=%.1fs, dead=%.1fs)",
            self.config.monitor_poll_seconds,
            self.config.timeout_seconds,
            self.config.dead_threshold_seconds,
        )

    async def stop_monitoring(self) -> None:
        """Cancel the background monitoring task."""
        if self._monitor_task is not None:
            self._monitor_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._monitor_task
            self._monitor_task = None
            logger.info("Heartbeat monitor stopped")

    async def _monitor_loop(self) -> None:
        """Periodically check all leases for expiry."""
        try:
            while True:
                await self._check_workers()
                await asyncio.sleep(self.config.monitor_poll_seconds)
        except asyncio.CancelledError:
            raise

    async def _check_workers(self) -> None:
        """Scan leases and handle expired workers (async version)."""
        for worker_id, lease in list(self._leases.items()):
            if not lease.is_alive:
                continue

            elapsed = lease.seconds_since_heartbeat()

            if elapsed > self.config.dead_threshold_seconds:
                # Worker is dead
                lease.is_alive = False
                logger.warning(
                    "Worker %s (run %s) declared DEAD (%.1fs since last heartbeat)",
                    worker_id, lease.run_id, elapsed,
                )

                # Mark dead in coordinator
                if self._coordinator is not None:
                    try:
                        self._coordinator.mark_worker_dead(lease.run_id, worker_id)
                    except Exception:
                        logger.exception(
                            "Failed to mark worker %s dead in coordinator", worker_id,
                        )

                # Fire failure callbacks
                await self._fire_failure_async(lease.run_id, worker_id)

            elif elapsed > self.config.timeout_seconds:
                logger.info(
                    "Worker %s (run %s) is unresponsive (%.1fs since last heartbeat)",
                    worker_id, lease.run_id, elapsed,
                )

    def _check_leases(self) -> None:
        """Scan leases and handle expired workers (sync version, legacy)."""
        for worker_id, lease in list(self._leases.items()):
            if not lease.is_alive:
                continue

            elapsed = lease.seconds_since_heartbeat()

            if elapsed > self.config.dead_threshold_seconds:
                lease.is_alive = False
                logger.warning(
                    "Worker %s (run %s) declared DEAD (%.1fs since last heartbeat)",
                    worker_id, lease.run_id, elapsed,
                )

                if self._coordinator is not None:
                    try:
                        self._coordinator.mark_worker_dead(lease.run_id, worker_id)
                    except Exception:
                        logger.exception(
                            "Failed to mark worker %s dead in coordinator", worker_id,
                        )

                self._fire_failure(lease.run_id, worker_id)

            elif elapsed > self.config.timeout_seconds:
                logger.info(
                    "Worker %s (run %s) is unresponsive (%.1fs since last heartbeat)",
                    worker_id, lease.run_id, elapsed,
                )
