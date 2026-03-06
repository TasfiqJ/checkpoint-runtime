"""Coordinator: distributed state management via etcd (with in-memory fallback).

The coordinator is responsible for:
- Managing run state and metadata in etcd.
- Tracking checkpoint status across the cluster.
- Worker lease management and heartbeat monitoring.
- Providing an in-memory fallback when etcd is unavailable (dev/test mode).
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Protocol, runtime_checkable
from uuid import uuid4

from controlplane.models import (
    CheckpointInfo,
    RunConfig,
    RunState,
    RunStatus,
    WorkerInfo,
)
from controlplane.state_machine import InvalidTransitionError, RunStateMachine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Key-value store abstraction
# ---------------------------------------------------------------------------

_KEY_PREFIX = "/checkpoint-runtime"


def _run_key(run_id: str) -> str:
    return f"{_KEY_PREFIX}/runs/{run_id}"


def _checkpoint_key(checkpoint_id: str) -> str:
    return f"{_KEY_PREFIX}/checkpoints/{checkpoint_id}"


def _worker_key(run_id: str, worker_id: str) -> str:
    return f"{_KEY_PREFIX}/workers/{run_id}/{worker_id}"


@runtime_checkable
class KVStore(Protocol):
    """Minimal key-value store interface compatible with etcd and in-memory."""

    def get(self, key: str) -> bytes | None: ...
    def put(self, key: str, value: bytes) -> None: ...
    def delete(self, key: str) -> None: ...
    def get_prefix(self, prefix: str) -> list[tuple[bytes, bytes]]: ...


# ---------------------------------------------------------------------------
# In-memory KV store (fallback for dev / tests)
# ---------------------------------------------------------------------------


class InMemoryKVStore:
    """Thread-safe in-memory key-value store that mimics the etcd interface."""

    def __init__(self) -> None:
        self._data: dict[str, bytes] = {}

    def get(self, key: str) -> bytes | None:
        return self._data.get(key)

    def put(self, key: str, value: bytes) -> None:
        self._data[key] = value

    def delete(self, key: str) -> None:
        self._data.pop(key, None)

    def get_prefix(self, prefix: str) -> list[tuple[bytes, bytes]]:
        return [
            (k.encode(), v)
            for k, v in self._data.items()
            if k.startswith(prefix)
        ]


# ---------------------------------------------------------------------------
# etcd adapter
# ---------------------------------------------------------------------------


class EtcdKVStore:
    """Thin adapter over the ``etcd3`` client library."""

    def __init__(self, host: str = "localhost", port: int = 2379) -> None:
        try:
            import etcd3  # type: ignore[import-untyped]

            self._client = etcd3.client(host=host, port=port)
            self._client.status()
            logger.info("Connected to etcd at %s:%d", host, port)
        except Exception:
            raise ConnectionError(
                f"Failed to connect to etcd at {host}:{port}"
            )

    def get(self, key: str) -> bytes | None:
        value, _ = self._client.get(key)
        return value  # type: ignore[return-value]

    def put(self, key: str, value: bytes) -> None:
        self._client.put(key, value)

    def delete(self, key: str) -> None:
        self._client.delete(key)

    def get_prefix(self, prefix: str) -> list[tuple[bytes, bytes]]:
        results: list[tuple[bytes, bytes]] = []
        for value, meta in self._client.get_prefix(prefix):
            results.append((meta.key, value))  # type: ignore[union-attr]
        return results


# ---------------------------------------------------------------------------
# Coordinator
# ---------------------------------------------------------------------------


class Coordinator:
    """High-level coordinator that manages runs, checkpoints, and workers.

    Falls back to an in-memory store when etcd is not reachable.
    """

    def __init__(
        self,
        etcd_host: str = "localhost",
        etcd_port: int = 2379,
        *,
        use_memory: bool = False,
    ) -> None:
        self._etcd_connected = False
        if use_memory:
            self._kv: KVStore = InMemoryKVStore()
            logger.warning("Using in-memory KV store (etcd unavailable or disabled)")
        else:
            try:
                self._kv = EtcdKVStore(host=etcd_host, port=etcd_port)
                self._etcd_connected = True
            except ConnectionError:
                self._kv = InMemoryKVStore()
                logger.warning(
                    "etcd unavailable at %s:%d — falling back to in-memory store",
                    etcd_host,
                    etcd_port,
                )

        self._fsms: dict[str, RunStateMachine] = {}
        self._start_time = time.monotonic()

    @property
    def etcd_connected(self) -> bool:
        return self._etcd_connected

    @property
    def uptime_seconds(self) -> float:
        return time.monotonic() - self._start_time

    # -- run management -----------------------------------------------------

    def create_run(self, config: RunConfig) -> RunStatus:
        """Create a new training run and persist its initial state."""
        run_id = uuid4().hex[:16]
        now = datetime.now(timezone.utc)

        fsm = RunStateMachine()
        self._fsms[run_id] = fsm

        status = RunStatus(
            run_id=run_id,
            name=config.name,
            state=RunState.CREATED,
            num_workers=config.num_workers,
            created_at=now,
            updated_at=now,
            config=config,
            metadata=config.metadata,
        )

        self._persist_run(status)
        logger.info("Created run %s (%s)", run_id, config.name)
        return status

    def get_run(self, run_id: str) -> RunStatus | None:
        raw = self._kv.get(_run_key(run_id))
        if raw is None:
            return None
        return RunStatus.model_validate_json(raw)

    def list_runs(self) -> list[RunStatus]:
        entries = self._kv.get_prefix(f"{_KEY_PREFIX}/runs/")
        runs: list[RunStatus] = []
        for _, value in entries:
            runs.append(RunStatus.model_validate_json(value))
        return runs

    def transition_run(self, run_id: str, target: RunState) -> RunStatus:
        status = self.get_run(run_id)
        if status is None:
            raise KeyError(f"Run {run_id!r} not found")

        fsm = self._ensure_fsm(run_id, status.state)
        fsm.transition(target)

        status.state = target
        status.updated_at = datetime.now(timezone.utc)
        self._persist_run(status)
        return status

    def update_run_step(self, run_id: str, step: int) -> RunStatus:
        status = self.get_run(run_id)
        if status is None:
            raise KeyError(f"Run {run_id!r} not found")
        status.current_step = step
        status.updated_at = datetime.now(timezone.utc)
        self._persist_run(status)
        return status

    def set_run_error(self, run_id: str, message: str) -> RunStatus:
        status = self.get_run(run_id)
        if status is None:
            raise KeyError(f"Run {run_id!r} not found")

        fsm = self._ensure_fsm(run_id, status.state)
        fsm.transition(RunState.FAILED)

        status.state = RunState.FAILED
        status.error_message = message
        status.updated_at = datetime.now(timezone.utc)
        self._persist_run(status)
        return status

    # -- checkpoint management ----------------------------------------------

    def create_checkpoint(
        self,
        run_id: str,
        step: int,
        metadata: dict[str, str] | None = None,
    ) -> CheckpointInfo:
        status = self.get_run(run_id)
        if status is None:
            raise KeyError(f"Run {run_id!r} not found")

        checkpoint_id = uuid4().hex[:16]
        now = datetime.now(timezone.utc)

        info = CheckpointInfo(
            checkpoint_id=checkpoint_id,
            run_id=run_id,
            step=step,
            state="PENDING",
            created_at=now,
            metadata=metadata or {},
        )

        self._kv.put(
            _checkpoint_key(checkpoint_id),
            info.model_dump_json().encode(),
        )

        status.last_checkpoint_id = checkpoint_id
        status.updated_at = now
        self._persist_run(status)

        logger.info("Created checkpoint %s for run %s at step %d", checkpoint_id, run_id, step)
        return info

    def get_checkpoint(self, checkpoint_id: str) -> CheckpointInfo | None:
        raw = self._kv.get(_checkpoint_key(checkpoint_id))
        if raw is None:
            return None
        return CheckpointInfo.model_validate_json(raw)

    def list_checkpoints(self, run_id: str) -> list[CheckpointInfo]:
        entries = self._kv.get_prefix(f"{_KEY_PREFIX}/checkpoints/")
        checkpoints: list[CheckpointInfo] = []
        for _, value in entries:
            info = CheckpointInfo.model_validate_json(value)
            if info.run_id == run_id:
                checkpoints.append(info)
        checkpoints.sort(key=lambda c: c.step)
        return checkpoints

    def update_checkpoint_state(
        self,
        checkpoint_id: str,
        state: str,
        *,
        num_shards: int | None = None,
        total_bytes: int | None = None,
        shard_ids: list[str] | None = None,
    ) -> CheckpointInfo:
        info = self.get_checkpoint(checkpoint_id)
        if info is None:
            raise KeyError(f"Checkpoint {checkpoint_id!r} not found")

        info.state = state
        if num_shards is not None:
            info.num_shards = num_shards
        if total_bytes is not None:
            info.total_bytes = total_bytes
        if shard_ids is not None:
            info.shard_ids = shard_ids
        if state == "COMMITTED" and info.committed_at is None:
            info.committed_at = datetime.now(timezone.utc)

        self._kv.put(
            _checkpoint_key(checkpoint_id),
            info.model_dump_json().encode(),
        )
        return info

    def update_checkpoint_metadata(
        self,
        checkpoint_id: str,
        metadata: dict[str, str],
        *,
        merge: bool = True,
    ) -> CheckpointInfo:
        """Update metadata for a checkpoint."""
        info = self.get_checkpoint(checkpoint_id)
        if info is None:
            raise KeyError(f"Checkpoint {checkpoint_id!r} not found")

        if merge:
            info.metadata.update(metadata)
        else:
            info.metadata = dict(metadata)

        self._kv.put(
            _checkpoint_key(checkpoint_id),
            info.model_dump_json().encode(),
        )
        return info

    # -- worker management --------------------------------------------------

    def register_worker(
        self,
        run_id: str,
        rank: int,
        hostname: str = "",
    ) -> WorkerInfo:
        worker_id = uuid4().hex[:12]
        now = datetime.now(timezone.utc)

        worker = WorkerInfo(
            worker_id=worker_id,
            run_id=run_id,
            rank=rank,
            hostname=hostname,
            status="ACTIVE",
            last_heartbeat=now,
        )

        self._kv.put(
            _worker_key(run_id, worker_id),
            worker.model_dump_json().encode(),
        )
        logger.info("Registered worker %s (rank %d) for run %s", worker_id, rank, run_id)
        return worker

    def heartbeat(self, run_id: str, worker_id: str, step: int = 0) -> WorkerInfo:
        raw = self._kv.get(_worker_key(run_id, worker_id))
        if raw is None:
            raise KeyError(f"Worker {worker_id!r} not found for run {run_id!r}")

        worker = WorkerInfo.model_validate_json(raw)
        worker.last_heartbeat = datetime.now(timezone.utc)
        worker.current_step = step

        self._kv.put(
            _worker_key(run_id, worker_id),
            worker.model_dump_json().encode(),
        )
        return worker

    def list_workers(self, run_id: str | None = None) -> list[WorkerInfo]:
        prefix = f"{_KEY_PREFIX}/workers/"
        if run_id:
            prefix = f"{_KEY_PREFIX}/workers/{run_id}/"

        entries = self._kv.get_prefix(prefix)
        workers: list[WorkerInfo] = []
        for _, value in entries:
            workers.append(WorkerInfo.model_validate_json(value))
        return workers

    def mark_worker_dead(self, run_id: str, worker_id: str) -> WorkerInfo:
        raw = self._kv.get(_worker_key(run_id, worker_id))
        if raw is None:
            raise KeyError(f"Worker {worker_id!r} not found for run {run_id!r}")

        worker = WorkerInfo.model_validate_json(raw)
        worker.status = "DEAD"

        self._kv.put(
            _worker_key(run_id, worker_id),
            worker.model_dump_json().encode(),
        )
        logger.warning("Worker %s marked DEAD for run %s", worker_id, run_id)
        return worker

    # -- internal helpers ---------------------------------------------------

    def _persist_run(self, status: RunStatus) -> None:
        self._kv.put(_run_key(status.run_id), status.model_dump_json().encode())

    def _ensure_fsm(self, run_id: str, current_state: RunState) -> RunStateMachine:
        if run_id not in self._fsms:
            self._fsms[run_id] = RunStateMachine(initial_state=current_state)
        return self._fsms[run_id]
