"""Integration tests for the REST API using FastAPI TestClient.

Tests exercise the full stack: HTTP request -> FastAPI -> Coordinator.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from controlplane.api import rest as rest_api
from controlplane.api.grpc_client import (
    AbortResult,
    CommitResult,
    DataPlaneHealth,
    WriteShardResult,
)
from controlplane.api.rest import create_app
from controlplane.coordinator import Coordinator
from controlplane.heartbeat import HeartbeatManager
from controlplane.models import RunConfig
from controlplane.worker_manager import WorkerManager


class FakeDataPlane:
    connected = True

    def __init__(
        self,
        *,
        write_error: Exception | None = None,
        write_success: bool = True,
        commit_success: bool = True,
    ) -> None:
        self.write_error = write_error
        self.write_success = write_success
        self.commit_success = commit_success
        self.aborted: list[tuple[str, str]] = []

    async def write_shard(self, chunks) -> WriteShardResult:
        if self.write_error:
            raise self.write_error
        size = 0
        async for chunk in chunks:
            size += len(chunk.data)
        return WriteShardResult(
            shard_id="rank-0",
            total_bytes=size,
            sha256_checksum="a" * 64,
            success=self.write_success,
        )

    async def commit_checkpoint(self, **_) -> CommitResult:
        return CommitResult(
            success=self.commit_success,
            manifest_key="run/checkpoint/_manifest.json" if self.commit_success else "",
            error_message="storage rejected manifest" if not self.commit_success else "",
        )

    async def abort_checkpoint(self, checkpoint_id: str, run_id: str) -> AbortResult:
        self.aborted.append((run_id, checkpoint_id))
        return AbortResult(success=True, shards_deleted=1)

    async def health_check(self) -> DataPlaneHealth:
        return DataPlaneHealth(healthy=True)


@pytest.fixture
def client() -> TestClient:
    """Return a TestClient wired to an in-memory coordinator (no lifespan)."""
    coord = Coordinator(use_memory=True)
    app = create_app(coordinator=coord, use_lifespan=False)
    return TestClient(app)


@pytest.fixture
def run_id(client: TestClient) -> str:
    """Create a run and return its ID."""
    resp = client.post("/api/runs", json={"name": "integration-run", "num_workers": 2})
    assert resp.status_code == 201
    return resp.json()["run_id"]


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


class TestRunEndpoints:
    def test_create_run(self, client: TestClient) -> None:
        resp = client.post("/api/runs", json={"name": "my-run", "num_workers": 4})
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "my-run"
        assert data["state"] == "CREATED"
        assert data["num_workers"] == 4

    def test_list_runs_empty(self, client: TestClient) -> None:
        resp = client.get("/api/runs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_runs(self, client: TestClient, run_id: str) -> None:
        resp = client.get("/api/runs")
        assert resp.status_code == 200
        runs = resp.json()
        assert len(runs) == 1
        assert runs[0]["run_id"] == run_id

    def test_get_run(self, client: TestClient, run_id: str) -> None:
        resp = client.get(f"/api/runs/{run_id}")
        assert resp.status_code == 200
        assert resp.json()["run_id"] == run_id

    def test_get_run_not_found(self, client: TestClient) -> None:
        resp = client.get("/api/runs/nonexistent")
        assert resp.status_code == 404

    def test_start_run(self, client: TestClient, run_id: str) -> None:
        resp = client.post(f"/api/runs/{run_id}/start")
        assert resp.status_code == 200
        assert resp.json()["state"] == "RUNNING"

    def test_cancel_run(self, client: TestClient, run_id: str) -> None:
        resp = client.post(f"/api/runs/{run_id}/cancel")
        assert resp.status_code == 200
        assert resp.json()["state"] == "CANCELLED"

    def test_complete_run(self, client: TestClient, run_id: str) -> None:
        client.post(f"/api/runs/{run_id}/start")
        resp = client.post(f"/api/runs/{run_id}/complete")
        assert resp.status_code == 200
        assert resp.json()["state"] == "COMPLETED"

    def test_invalid_transition_returns_409(self, client: TestClient, run_id: str) -> None:
        resp = client.post(f"/api/runs/{run_id}/complete")
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Checkpoint lifecycle
# ---------------------------------------------------------------------------


class TestCheckpointEndpoints:
    def test_trigger_checkpoint(self, client: TestClient, run_id: str) -> None:
        client.post(f"/api/runs/{run_id}/start")
        resp = client.post(f"/api/runs/{run_id}/checkpoint?step=100")
        assert resp.status_code == 200
        data = resp.json()
        assert data["run_id"] == run_id
        assert data["step"] == 100
        assert data["state"] == "PENDING"

    def test_commit_without_uploaded_shard_is_rejected(
        self,
        client: TestClient,
        run_id: str,
    ) -> None:
        client.post(f"/api/runs/{run_id}/start")
        client.post(f"/api/runs/{run_id}/checkpoint?step=100")
        resp = client.post(f"/api/runs/{run_id}/commit")
        assert resp.status_code == 409
        assert resp.json()["detail"] == "No uploaded checkpoint is ready to commit"

    def test_upload_and_commit_succeeds(self) -> None:
        coordinator = Coordinator(use_memory=True)
        app = create_app(coordinator=coordinator, use_lifespan=False)
        data_plane = FakeDataPlane()
        app.state.dp_client = data_plane
        client = TestClient(app)
        run = client.post("/api/runs", json={"name": "upload", "num_workers": 1}).json()
        run_id = run["run_id"]
        client.post(f"/api/runs/{run_id}/start")
        checkpoint = client.post(f"/api/runs/{run_id}/checkpoint?step=100").json()

        upload = client.post(
            f"/api/runs/{run_id}/checkpoints/{checkpoint['checkpoint_id']}/shards/rank-0",
            content=b"model-state",
        )
        commit = client.post(f"/api/runs/{run_id}/commit")

        assert upload.status_code == 200
        assert commit.status_code == 200
        assert commit.json()["state"] == "RUNNING"
        assert coordinator.get_checkpoint(checkpoint["checkpoint_id"]).state == "COMMITTED"

    def test_failed_upload_is_aborted_and_never_committed(self) -> None:
        coordinator = Coordinator(use_memory=True)
        app = create_app(coordinator=coordinator, use_lifespan=False)
        data_plane = FakeDataPlane(write_error=RuntimeError("S3 full"))
        app.state.dp_client = data_plane
        client = TestClient(app)
        run_id = client.post(
            "/api/runs",
            json={"name": "upload-failure", "num_workers": 1},
        ).json()["run_id"]
        client.post(f"/api/runs/{run_id}/start")
        checkpoint = client.post(f"/api/runs/{run_id}/checkpoint?step=100").json()

        upload = client.post(
            f"/api/runs/{run_id}/checkpoints/{checkpoint['checkpoint_id']}/shards/rank-0",
            content=b"model-state",
        )

        assert upload.status_code == 502
        assert coordinator.get_checkpoint(checkpoint["checkpoint_id"]).state == "FAILED"
        assert coordinator.get_run(run_id).state.value == "FAILED"
        assert data_plane.aborted == [(run_id, checkpoint["checkpoint_id"])]

    def test_rejected_shard_is_aborted_and_never_committed(self) -> None:
        coordinator = Coordinator(use_memory=True)
        app = create_app(coordinator=coordinator, use_lifespan=False)
        data_plane = FakeDataPlane(write_success=False)
        app.state.dp_client = data_plane
        client = TestClient(app)
        run_id = client.post(
            "/api/runs",
            json={"name": "shard-rejection", "num_workers": 1},
        ).json()["run_id"]
        client.post(f"/api/runs/{run_id}/start")
        checkpoint = client.post(f"/api/runs/{run_id}/checkpoint?step=100").json()

        upload = client.post(
            f"/api/runs/{run_id}/checkpoints/{checkpoint['checkpoint_id']}/shards/rank-0",
            content=b"model-state",
        )

        assert upload.status_code == 502
        assert coordinator.get_checkpoint(checkpoint["checkpoint_id"]).state == "FAILED"
        assert coordinator.get_run(run_id).state.value == "FAILED"
        assert data_plane.aborted == [(run_id, checkpoint["checkpoint_id"])]

    def test_rejected_manifest_is_aborted_and_never_committed(self) -> None:
        coordinator = Coordinator(use_memory=True)
        app = create_app(coordinator=coordinator, use_lifespan=False)
        data_plane = FakeDataPlane(commit_success=False)
        app.state.dp_client = data_plane
        client = TestClient(app)
        run_id = client.post(
            "/api/runs",
            json={"name": "commit-failure", "num_workers": 1},
        ).json()["run_id"]
        client.post(f"/api/runs/{run_id}/start")
        checkpoint = client.post(f"/api/runs/{run_id}/checkpoint?step=100").json()
        client.post(
            f"/api/runs/{run_id}/checkpoints/{checkpoint['checkpoint_id']}/shards/rank-0",
            content=b"model-state",
        )

        commit = client.post(f"/api/runs/{run_id}/commit")

        assert commit.status_code == 502
        assert coordinator.get_checkpoint(checkpoint["checkpoint_id"]).state == "FAILED"
        assert coordinator.get_run(run_id).state.value == "FAILED"
        assert data_plane.aborted == [(run_id, checkpoint["checkpoint_id"])]

    def test_list_run_checkpoints(self, client: TestClient, run_id: str) -> None:
        client.post(f"/api/runs/{run_id}/start")
        client.post(f"/api/runs/{run_id}/checkpoint?step=100")
        client.post(f"/api/runs/{run_id}/commit")
        client.post(f"/api/runs/{run_id}/resume")
        client.post(f"/api/runs/{run_id}/checkpoint?step=200")
        resp = client.get(f"/api/runs/{run_id}/checkpoints")
        assert resp.status_code == 200
        cps = resp.json()
        assert len(cps) == 2

    def test_get_checkpoint_by_id(self, client: TestClient, run_id: str) -> None:
        client.post(f"/api/runs/{run_id}/start")
        cp_resp = client.post(f"/api/runs/{run_id}/checkpoint?step=100")
        cp_id = cp_resp.json()["checkpoint_id"]
        resp = client.get(f"/api/checkpoints/{cp_id}")
        assert resp.status_code == 200
        assert resp.json()["checkpoint_id"] == cp_id


# ---------------------------------------------------------------------------
# Resume
# ---------------------------------------------------------------------------


class TestResumeEndpoints:
    def test_resume_from_committed(self, client: TestClient, run_id: str) -> None:
        client.post(f"/api/runs/{run_id}/start")
        client.post(f"/api/runs/{run_id}/checkpoint?step=100")
        client.post(f"/api/runs/{run_id}/commit")
        resp = client.post(f"/api/runs/{run_id}/resume")
        assert resp.status_code == 200
        assert resp.json()["state"] == "RUNNING"

    def test_resume_from_created(self, client: TestClient, run_id: str) -> None:
        resp = client.post(f"/api/runs/{run_id}/resume")
        assert resp.status_code == 200
        assert resp.json()["state"] == "RUNNING"


# ---------------------------------------------------------------------------
# Health & metrics
# ---------------------------------------------------------------------------


class TestHealthEndpoints:
    def test_health(self, client: TestClient) -> None:
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "DEGRADED"
        assert data["etcd_connected"] is False
        assert data["dataplane_connected"] is False
        assert "version" in data

    def test_metrics_summary(self, client: TestClient) -> None:
        resp = client.get("/api/metrics/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_runs" in data
        assert "active_runs" in data
        assert "total_workers" in data

    def test_metrics_summary_with_runs(self, client: TestClient, run_id: str) -> None:
        client.post(f"/api/runs/{run_id}/start")
        resp = client.get("/api/metrics/summary")
        data = resp.json()
        assert data["total_runs"] == 1
        assert data["active_runs"] == 1

    def test_heartbeat_lags_endpoint(self, client: TestClient) -> None:
        resp = client.get("/api/metrics/heartbeat-lags")
        assert resp.status_code == 200
        assert "lags" in resp.json()


# ---------------------------------------------------------------------------
# Workers (without lifespan, worker_mgr may not be initialized)
# ---------------------------------------------------------------------------


class TestWorkerEndpoints:
    def test_list_workers_without_manager(self, client: TestClient) -> None:
        resp = client.get("/api/workers")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_worker_rank_and_live_run_count(
        self,
        client: TestClient,
        run_id: str,
    ) -> None:
        worker_resp = client.post(
            "/api/workers/register",
            json={
                "run_id": run_id,
                "hostname": "worker-1",
                "rank": 1,
            },
        )
        assert worker_resp.status_code == 201
        assert worker_resp.json()["rank"] == 1

        run_resp = client.get(f"/api/runs/{run_id}")
        assert run_resp.status_code == 200
        assert run_resp.json()["active_workers"] == 1

    def test_superseded_worker_heartbeat_is_rejected_without_reregistration(self) -> None:
        coordinator = Coordinator(use_memory=True)
        heartbeat_mgr = HeartbeatManager(coordinator=coordinator)
        worker_mgr = WorkerManager(coordinator, heartbeat_mgr)
        app = create_app(coordinator=coordinator, use_lifespan=False)
        app.state.worker_mgr = worker_mgr
        client = TestClient(app)
        run_id = client.post(
            "/api/runs",
            json={"name": "worker-generation", "num_workers": 1},
        ).json()["run_id"]

        old_worker = client.post(
            "/api/workers/register",
            json={"run_id": run_id, "rank": 0},
        ).json()
        new_worker = client.post(
            "/api/workers/register",
            json={"run_id": run_id, "rank": 0},
        ).json()

        response = client.post(
            f"/api/workers/{old_worker['worker_id']}/heartbeat",
            json={"step": 100},
        )

        assert response.status_code == 409

        coordinator.mark_worker_dead(run_id, new_worker["worker_id"])
        worker_mgr.get_worker(new_worker["worker_id"]).status = "DEAD"
        timed_out_response = client.post(
            f"/api/workers/{new_worker['worker_id']}/heartbeat",
            json={"step": 100},
        )
        assert timed_out_response.status_code == 404

    def test_deregistered_worker_heartbeat_is_a_tombstone_conflict(self) -> None:
        coordinator = Coordinator(use_memory=True)
        heartbeat_mgr = HeartbeatManager(coordinator=coordinator)
        worker_mgr = WorkerManager(coordinator, heartbeat_mgr)
        app = create_app(coordinator=coordinator, use_lifespan=False)
        app.state.worker_mgr = worker_mgr
        client = TestClient(app)
        run_id = client.post(
            "/api/runs",
            json={"name": "worker-deregister", "num_workers": 1},
        ).json()["run_id"]
        worker = client.post(
            "/api/workers/register",
            json={"run_id": run_id, "rank": 0},
        ).json()

        deregister_response = client.post(f"/api/workers/{worker['worker_id']}/deregister")
        heartbeat_response = client.post(
            f"/api/workers/{worker['worker_id']}/heartbeat",
            json={"step": 1},
        )

        assert deregister_response.status_code == 200
        assert heartbeat_response.status_code == 409

    def test_worker_group_restart_deduplicates_in_flight_attempts(
        self,
        monkeypatch,
    ) -> None:
        coordinator = Coordinator(use_memory=True)
        run = coordinator.create_run(RunConfig(name="restart-dedupe", num_workers=1))
        heartbeat_mgr = HeartbeatManager(coordinator=coordinator)
        worker_mgr = WorkerManager(coordinator, heartbeat_mgr)
        worker_mgr.register_worker(run.run_id, rank=0)
        restart_targets = []

        class DeferredThread:
            def __init__(self, *, target, **_) -> None:
                self.target = target

            def start(self) -> None:
                restart_targets.append(self.target)

        monkeypatch.setattr(rest_api.threading, "Thread", DeferredThread)
        monkeypatch.setattr(
            rest_api.subprocess,
            "run",
            lambda *_, **__: SimpleNamespace(returncode=0, stderr=""),
        )
        with rest_api._WORKER_RESTART_STATE_LOCK:
            rest_api._WORKER_RESTART_LAST_ATTEMPT.clear()
            rest_api._WORKER_RESTART_IN_FLIGHT = None

        assert rest_api._schedule_worker_group_restart(
            run.run_id,
            coordinator,
            heartbeat_mgr,
            worker_mgr,
        )
        assert rest_api._schedule_worker_group_restart(
            run.run_id,
            coordinator,
            heartbeat_mgr,
            worker_mgr,
        )
        assert len(restart_targets) == 1

        restart_targets[0]()
        assert rest_api._WORKER_RESTART_IN_FLIGHT is None

    def test_worker_group_restart_thread_start_failure_is_retryable(
        self,
        monkeypatch,
    ) -> None:
        coordinator = Coordinator(use_memory=True)
        run = coordinator.create_run(RunConfig(name="restart-thread-failure", num_workers=1))
        heartbeat_mgr = HeartbeatManager(coordinator=coordinator)
        worker_mgr = WorkerManager(coordinator, heartbeat_mgr)
        worker_mgr.register_worker(run.run_id, rank=0)

        class BrokenThread:
            def __init__(self, **_) -> None:
                pass

            def start(self) -> None:
                raise RuntimeError("thread unavailable")

        monkeypatch.setattr(rest_api.threading, "Thread", BrokenThread)
        with rest_api._WORKER_RESTART_STATE_LOCK:
            rest_api._WORKER_RESTART_LAST_ATTEMPT.clear()
            rest_api._WORKER_RESTART_IN_FLIGHT = None

        assert not rest_api._schedule_worker_group_restart(
            run.run_id,
            coordinator,
            heartbeat_mgr,
            worker_mgr,
        )
        assert rest_api._WORKER_RESTART_IN_FLIGHT is None
        assert run.run_id not in rest_api._WORKER_RESTART_LAST_ATTEMPT

    def test_worker_group_restart_rejects_unrelated_supervised_run(
        self,
        monkeypatch,
        tmp_path,
    ) -> None:
        coordinator = Coordinator(use_memory=True)
        run = coordinator.create_run(RunConfig(name="unrelated-run", num_workers=1))
        heartbeat_mgr = HeartbeatManager(coordinator=coordinator)
        worker_mgr = WorkerManager(coordinator, heartbeat_mgr)
        worker = worker_mgr.register_worker(run.run_id, rank=0)
        shared_run_path = tmp_path / "run_id"
        shared_run_path.write_text("different-supervised-run", encoding="utf-8")
        monkeypatch.setenv("SHARED_RUN_ID_PATH", str(shared_run_path))

        assert not rest_api._schedule_worker_group_restart(
            run.run_id,
            coordinator,
            heartbeat_mgr,
            worker_mgr,
        )

        persisted_worker = coordinator.list_workers(run.run_id)[0]
        assert persisted_worker.status == "ACTIVE"
        assert worker_mgr.get_worker(worker.worker_id).status == "ACTIVE"
        assert heartbeat_mgr.get_lease(worker.worker_id) is not None


# ---------------------------------------------------------------------------
# Datasets
# ---------------------------------------------------------------------------


class TestDatasetEndpoints:
    def test_register_dataset(self, client: TestClient) -> None:
        resp = client.post(
            "/api/datasets",
            json={
                "dataset_id": "ds-001",
                "uri": "s3://bucket/data",
                "sharding_policy": "RANGE_SHARDING",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["dataset_id"] == "ds-001"
        assert data["uri"] == "s3://bucket/data"
