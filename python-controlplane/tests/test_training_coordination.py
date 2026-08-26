"""Regression tests for multi-rank run coordination."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
import torch


TRAINING_DIR = Path(__file__).resolve().parents[2] / "training-harness"
sys.path.insert(0, str(TRAINING_DIR))
SPEC = importlib.util.spec_from_file_location("checkpoint_training", TRAINING_DIR / "train.py")
assert SPEC is not None and SPEC.loader is not None
checkpoint_training = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checkpoint_training)


class FakeRuntimeClient:
    def __init__(self) -> None:
        self.states = {
            "completed-run": "COMPLETED",
            "fresh-run": "RUNNING",
            "recovering-run": "RECOVERING",
        }
        self.resumed: list[str] = []

    def get_run_status(self, run_id: str) -> dict[str, str]:
        return {"run_id": run_id, "state": self.states[run_id]}

    def start_run(self, **_: object) -> dict[str, str]:
        return {"run_id": "fresh-run"}

    def resume(self, run_id: str) -> dict[str, str]:
        self.resumed.append(run_id)
        return {"run_id": run_id}


def test_nonzero_rank_rejects_completed_shared_run(monkeypatch, tmp_path: Path) -> None:
    shared_path = tmp_path / "run_id"
    shared_path.write_text("completed-run")
    monkeypatch.setattr(checkpoint_training, "_SHARED_RUN_ID_PATH", shared_path)

    def publish_fresh_run(_: float) -> None:
        shared_path.write_text("fresh-run")

    monkeypatch.setattr(checkpoint_training.time, "sleep", publish_fresh_run)

    selected = checkpoint_training._get_or_create_run_id(
        FakeRuntimeClient(),
        rank=1,
        world_size=2,
    )

    assert selected == "fresh-run"


def test_rank_zero_atomically_replaces_terminal_run(monkeypatch, tmp_path: Path) -> None:
    shared_path = tmp_path / "run_id"
    shared_path.write_text("completed-run")
    monkeypatch.setattr(checkpoint_training, "_SHARED_RUN_ID_PATH", shared_path)

    selected = checkpoint_training._get_or_create_run_id(
        FakeRuntimeClient(),
        rank=0,
        world_size=2,
    )

    assert selected == "fresh-run"
    assert shared_path.read_text() == "fresh-run"
    assert not shared_path.with_suffix(".tmp").exists()


def test_rank_zero_does_not_report_recovering_run_as_running(
    monkeypatch,
    tmp_path: Path,
) -> None:
    shared_path = tmp_path / "run_id"
    shared_path.write_text("recovering-run")
    monkeypatch.setattr(checkpoint_training, "_SHARED_RUN_ID_PATH", shared_path)
    runtime_client = FakeRuntimeClient()

    selected = checkpoint_training._get_or_create_run_id(
        runtime_client,
        rank=0,
        world_size=2,
    )

    assert selected == "recovering-run"
    assert runtime_client.resumed == []


class WorkerNotFoundError(Exception):
    status_code = 404


class TemporaryControlPlaneError(Exception):
    status_code = 503


class ForgottenWorkerClient:
    def __init__(self) -> None:
        self.heartbeats: list[tuple[str, int]] = []
        self.registrations: list[dict[str, object]] = []

    def heartbeat(self, worker_id: str, step: int) -> None:
        self.heartbeats.append((worker_id, step))
        if worker_id == "old-worker":
            raise WorkerNotFoundError("worker forgotten")

    def register_worker(self, **payload: object) -> dict[str, str]:
        self.registrations.append(payload)
        return {"worker_id": "new-worker"}


def test_heartbeat_reregisters_after_control_plane_forgets_worker() -> None:
    runtime_client = ForgottenWorkerClient()
    heartbeat = checkpoint_training.HeartbeatThread(
        runtime_client,
        "old-worker",
        run_id="run-1",
        hostname="worker-host",
        rank=1,
    )
    heartbeat.update_step(42)

    heartbeat._send_heartbeat()
    heartbeat._send_heartbeat()

    assert runtime_client.registrations == [
        {
            "run_id": "run-1",
            "hostname": "worker-host",
            "rank": 1,
        }
    ]
    assert runtime_client.heartbeats == [
        ("old-worker", 42),
        ("new-worker", 42),
    ]


class TransientLookupClient(FakeRuntimeClient):
    def __init__(self) -> None:
        super().__init__()
        self.lookups = 0
        self.started = False

    def get_run_status(self, run_id: str) -> dict[str, str]:
        self.lookups += 1
        if self.lookups == 1:
            raise TemporaryControlPlaneError("temporarily unavailable")
        return super().get_run_status(run_id)

    def start_run(self, **kwargs: object) -> dict[str, str]:
        self.started = True
        return super().start_run(**kwargs)


def test_rank_zero_does_not_replace_run_after_transient_lookup_error(
    monkeypatch,
    tmp_path: Path,
) -> None:
    shared_path = tmp_path / "run_id"
    shared_path.write_text("fresh-run")
    monkeypatch.setattr(checkpoint_training, "_SHARED_RUN_ID_PATH", shared_path)
    runtime_client = TransientLookupClient()

    with pytest.raises(RuntimeError, match="Could not verify shared run"):
        checkpoint_training._get_or_create_run_id(
            runtime_client,
            rank=0,
            world_size=2,
        )

    assert runtime_client.started is False
    assert shared_path.read_text() == "fresh-run"


def test_nonzero_rank_retries_same_id_after_transient_lookup_error(
    monkeypatch,
    tmp_path: Path,
) -> None:
    shared_path = tmp_path / "run_id"
    shared_path.write_text("fresh-run")
    monkeypatch.setattr(checkpoint_training, "_SHARED_RUN_ID_PATH", shared_path)
    monkeypatch.setattr(checkpoint_training.time, "sleep", lambda _: None)
    runtime_client = TransientLookupClient()

    selected = checkpoint_training._get_or_create_run_id(
        runtime_client,
        rank=1,
        world_size=2,
    )

    assert selected == "fresh-run"
    assert runtime_client.lookups == 2


class BrokenRestoreClient:
    def list_checkpoints(self, _: str) -> list[dict[str, object]]:
        return [{"checkpoint_id": "broken", "step": 50, "state": "COMMITTED"}]

    def load_shard(self, **_: object) -> bytes:
        raise OSError("corrupt or missing shard")


def test_restore_failure_never_falls_back_to_step_zero() -> None:
    model = torch.nn.Linear(2, 2)
    with pytest.raises(RuntimeError, match="Refusing to start"):
        checkpoint_training.load_checkpoint_runtime(
            model,
            torch.optim.Adam(model.parameters()),
            rank=0,
            runtime_client=BrokenRestoreClient(),
            run_id="recovering-run",
        )


class BrokenSaveClient:
    def checkpoint(self, *_: object, **__: object) -> dict[str, str]:
        raise OSError("storage unavailable")


def test_runtime_checkpoint_failure_forces_group_recovery() -> None:
    model = torch.nn.Linear(2, 2)
    optimizer = torch.optim.Adam(model.parameters())

    with pytest.raises(RuntimeError, match="workers must recover as a group"):
        checkpoint_training.save_checkpoint_runtime(
            model,
            optimizer,
            step=50,
            loss=1.0,
            rank=0,
            runtime_client=BrokenSaveClient(),
            run_id="run-1",
        )
