"""Unit tests for the Coordinator with in-memory KV store.

Tests validate:
- Run CRUD operations
- State transitions through the coordinator
- Checkpoint creation and management
- Worker registration and heartbeat
"""

from __future__ import annotations

import base64
import json

import httpx
import pytest

from controlplane.coordinator import Coordinator, EtcdKVStore, InMemoryKVStore
from controlplane.models import RunConfig, RunState
from controlplane.state_machine import InvalidTransitionError


@pytest.fixture
def coord() -> Coordinator:
    return Coordinator(use_memory=True)


@pytest.fixture
def config() -> RunConfig:
    return RunConfig(name="unit-test-run", num_workers=2)


class TestEtcdKVStore:
    def test_http_gateway_round_trip_and_prefix(self) -> None:
        values: dict[bytes, bytes] = {}

        def decode(value: str) -> bytes:
            return base64.b64decode(value)

        def encode(value: bytes) -> str:
            return base64.b64encode(value).decode()

        def handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content or b"{}")
            if request.url.path == "/v3/maintenance/status":
                return httpx.Response(200, json={"version": "3.5.12"})
            if request.url.path == "/v3/kv/put":
                values[decode(payload["key"])] = decode(payload["value"])
                return httpx.Response(200, json={})
            if request.url.path == "/v3/kv/deleterange":
                values.pop(decode(payload["key"]), None)
                return httpx.Response(200, json={"deleted": "1"})
            if request.url.path == "/v3/kv/range":
                start = decode(payload["key"])
                end = decode(payload["range_end"]) if "range_end" in payload else None
                if end is None:
                    matches = [(key, value) for key, value in values.items() if key == start]
                else:
                    matches = [
                        (key, value)
                        for key, value in sorted(values.items())
                        if start <= key < end
                    ]
                return httpx.Response(200, json={
                    "kvs": [
                        {"key": encode(key), "value": encode(value)}
                        for key, value in matches
                    ],
                })
            return httpx.Response(404)

        client = httpx.Client(
            base_url="http://etcd:2379",
            transport=httpx.MockTransport(handler),
        )
        store = EtcdKVStore(client=client)

        store.put("/runs/a", b"one")
        store.put("/runs/b", b"two")
        store.put("/workers/a", b"worker")

        assert store.get("/runs/a") == b"one"
        assert store.get("/missing") is None
        assert store.get_prefix("/runs/") == [
            (b"/runs/a", b"one"),
            (b"/runs/b", b"two"),
        ]

        store.delete("/runs/a")
        assert store.get("/runs/a") is None

    def test_connection_failure_is_reported(self) -> None:
        client = httpx.Client(
            base_url="http://etcd:2379",
            transport=httpx.MockTransport(lambda _: httpx.Response(503)),
        )
        with pytest.raises(ConnectionError):
            EtcdKVStore(client=client)


# ---------------------------------------------------------------------------
# Run CRUD
# ---------------------------------------------------------------------------


class TestRunCRUD:
    def test_create_run(self, coord: Coordinator, config: RunConfig) -> None:
        status = coord.create_run(config)
        assert status.run_id
        assert status.name == "unit-test-run"
        assert status.state == RunState.CREATED
        assert status.num_workers == 2

    def test_get_run(self, coord: Coordinator, config: RunConfig) -> None:
        created = coord.create_run(config)
        fetched = coord.get_run(created.run_id)
        assert fetched is not None
        assert fetched.run_id == created.run_id
        assert fetched.name == created.name

    def test_get_nonexistent_run(self, coord: Coordinator) -> None:
        assert coord.get_run("does-not-exist") is None

    def test_list_runs_empty(self, coord: Coordinator) -> None:
        assert coord.list_runs() == []

    def test_list_runs_multiple(self, coord: Coordinator) -> None:
        coord.create_run(RunConfig(name="run-a", num_workers=1))
        coord.create_run(RunConfig(name="run-b", num_workers=2))
        runs = coord.list_runs()
        assert len(runs) == 2
        names = {r.name for r in runs}
        assert names == {"run-a", "run-b"}


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


class TestStateTransitions:
    def test_start_run(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        updated = coord.transition_run(run.run_id, RunState.RUNNING)
        assert updated.state == RunState.RUNNING

    def test_full_lifecycle(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        coord.transition_run(run.run_id, RunState.RUNNING)
        coord.transition_run(run.run_id, RunState.CHECKPOINTING)
        coord.transition_run(run.run_id, RunState.COMMITTED)
        coord.transition_run(run.run_id, RunState.COMPLETED)
        final = coord.get_run(run.run_id)
        assert final is not None
        assert final.state == RunState.COMPLETED

    def test_invalid_transition_raises(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        with pytest.raises(InvalidTransitionError):
            coord.transition_run(run.run_id, RunState.COMMITTED)

    def test_transition_nonexistent_run_raises(self, coord: Coordinator) -> None:
        with pytest.raises(KeyError):
            coord.transition_run("nonexistent", RunState.RUNNING)

    def test_set_run_error(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        coord.transition_run(run.run_id, RunState.RUNNING)
        errored = coord.set_run_error(run.run_id, "OOM on worker 3")
        assert errored.state == RunState.FAILED
        assert errored.error_message == "OOM on worker 3"

    def test_update_run_step(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        updated = coord.update_run_step(run.run_id, 42)
        assert updated.current_step == 42


# ---------------------------------------------------------------------------
# Checkpoint management
# ---------------------------------------------------------------------------


class TestCheckpointManagement:
    def test_create_checkpoint(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        cp = coord.create_checkpoint(run.run_id, step=100)
        assert cp.checkpoint_id
        assert cp.run_id == run.run_id
        assert cp.step == 100
        assert cp.state == "PENDING"

    def test_get_checkpoint(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        cp = coord.create_checkpoint(run.run_id, step=200)
        fetched = coord.get_checkpoint(cp.checkpoint_id)
        assert fetched is not None
        assert fetched.checkpoint_id == cp.checkpoint_id

    def test_get_nonexistent_checkpoint(self, coord: Coordinator) -> None:
        assert coord.get_checkpoint("no-such-cp") is None

    def test_list_checkpoints(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        coord.create_checkpoint(run.run_id, step=100)
        coord.create_checkpoint(run.run_id, step=200)
        coord.create_checkpoint(run.run_id, step=300)
        cps = coord.list_checkpoints(run.run_id)
        assert len(cps) == 3
        assert [c.step for c in cps] == [100, 200, 300]

    def test_update_checkpoint_state(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        cp = coord.create_checkpoint(run.run_id, step=100)
        updated = coord.update_checkpoint_state(
            cp.checkpoint_id, "COMMITTED", total_bytes=1024, num_shards=4,
        )
        assert updated.state == "COMMITTED"
        assert updated.total_bytes == 1024
        assert updated.num_shards == 4
        assert updated.committed_at is not None

    def test_checkpoint_updates_run_last_checkpoint_id(
        self, coord: Coordinator, config: RunConfig,
    ) -> None:
        run = coord.create_run(config)
        cp = coord.create_checkpoint(run.run_id, step=100)
        refreshed = coord.get_run(run.run_id)
        assert refreshed is not None
        assert refreshed.last_checkpoint_id == cp.checkpoint_id


# ---------------------------------------------------------------------------
# Worker management
# ---------------------------------------------------------------------------


class TestWorkerManagement:
    def test_register_worker(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        w = coord.register_worker(run.run_id, rank=0, hostname="node-0")
        assert w.worker_id
        assert w.run_id == run.run_id
        assert w.rank == 0
        assert w.hostname == "node-0"
        assert w.status == "ACTIVE"

    def test_list_workers_by_run(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        coord.register_worker(run.run_id, rank=0)
        coord.register_worker(run.run_id, rank=1)
        workers = coord.list_workers(run_id=run.run_id)
        assert len(workers) == 2

    def test_heartbeat(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        w = coord.register_worker(run.run_id, rank=0)
        updated = coord.heartbeat(run.run_id, w.worker_id, step=50)
        assert updated.current_step == 50

    def test_heartbeat_nonexistent_worker_raises(self, coord: Coordinator) -> None:
        with pytest.raises(KeyError):
            coord.heartbeat("run-x", "worker-x", step=0)

    def test_mark_worker_dead(self, coord: Coordinator, config: RunConfig) -> None:
        run = coord.create_run(config)
        w = coord.register_worker(run.run_id, rank=0)
        dead = coord.mark_worker_dead(run.run_id, w.worker_id)
        assert dead.status == "DEAD"


# ---------------------------------------------------------------------------
# InMemoryKVStore
# ---------------------------------------------------------------------------


class TestInMemoryKVStore:
    def test_put_and_get(self) -> None:
        kv = InMemoryKVStore()
        kv.put("key", b"value")
        assert kv.get("key") == b"value"

    def test_get_missing(self) -> None:
        kv = InMemoryKVStore()
        assert kv.get("missing") is None

    def test_delete(self) -> None:
        kv = InMemoryKVStore()
        kv.put("key", b"value")
        kv.delete("key")
        assert kv.get("key") is None

    def test_delete_missing_no_error(self) -> None:
        kv = InMemoryKVStore()
        kv.delete("missing")  # should not raise

    def test_get_prefix(self) -> None:
        kv = InMemoryKVStore()
        kv.put("/runs/a", b"1")
        kv.put("/runs/b", b"2")
        kv.put("/checkpoints/x", b"3")
        results = kv.get_prefix("/runs/")
        assert len(results) == 2
