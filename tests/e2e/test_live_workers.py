"""End-to-end proof that the real two-worker demo can checkpoint and recover."""

from __future__ import annotations

import os
import time

import httpx
import pytest


BASE_URL = os.getenv("CONTROLPLANE_URL", "http://localhost:8000")
TIMEOUT = int(os.getenv("E2E_WORKER_TIMEOUT", "240"))


@pytest.fixture(scope="module")
def api():
    with httpx.Client(base_url=BASE_URL, timeout=30) as client:
        for _ in range(60):
            try:
                response = client.get("/api/health")
                if (
                    response.status_code == 200
                    and response.json().get("status") == "HEALTHY"
                ):
                    break
            except httpx.ConnectError:
                pass
            time.sleep(2)
        else:
            message = "Healthy control plane not reachable"
            if os.getenv("E2E_REQUIRED") == "1":
                pytest.fail(message)
            pytest.skip(message)
        yield client


def _active_workers(api: httpx.Client, run_id: str) -> list[dict]:
    response = api.get("/api/workers")
    assert response.status_code == 200, response.text
    return [
        worker
        for worker in response.json()
        if worker.get("run_id") == run_id and worker.get("status") == "ACTIVE"
    ]


def _wait_for_training_run(api: httpx.Client) -> tuple[dict, list[dict]]:
    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        response = api.get("/api/runs")
        assert response.status_code == 200, response.text
        for run in reversed(response.json()):
            if run.get("state") not in {
                "RUNNING",
                "CHECKPOINTING",
                "COMMITTED",
                "RECOVERING",
            }:
                continue
            workers = _active_workers(api, run["run_id"])
            if {worker.get("rank") for worker in workers} == {0, 1}:
                return run, workers
        time.sleep(1)
    raise TimeoutError("Two stable ACTIVE worker ranks did not register")


def _wait_for_committed_checkpoint(api: httpx.Client, run_id: str) -> dict:
    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        response = api.get(f"/api/runs/{run_id}/checkpoints")
        assert response.status_code == 200, response.text
        committed = [
            checkpoint
            for checkpoint in response.json()
            if checkpoint.get("state") == "COMMITTED"
            and int(checkpoint.get("total_bytes", 0)) > 0
        ]
        if committed:
            return max(committed, key=lambda checkpoint: int(checkpoint["step"]))
        time.sleep(1)
    raise TimeoutError("Workers did not create a non-empty COMMITTED checkpoint")


@pytest.mark.e2e
def test_live_worker_group_recovers_from_committed_checkpoint(
    api: httpx.Client,
) -> None:
    run, workers = _wait_for_training_run(api)
    run_id = run["run_id"]
    checkpoint = _wait_for_committed_checkpoint(api, run_id)
    checkpoint_step = int(checkpoint["step"])
    old_worker_ids = {worker["worker_id"] for worker in workers}

    kill_response = api.post("/api/demo/kill-worker/ckpt-worker-0")
    assert kill_response.status_code == 200, kill_response.text
    assert kill_response.json().get("success") is True, kill_response.text

    saw_recovering = False
    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        run_response = api.get(f"/api/runs/{run_id}")
        assert run_response.status_code == 200, run_response.text
        state = run_response.json().get("state")
        saw_recovering = saw_recovering or state == "RECOVERING"

        active_workers = _active_workers(api, run_id)
        new_worker_ids = {worker["worker_id"] for worker in active_workers}
        ranks = {worker.get("rank") for worker in active_workers}
        restored_steps = [
            int(worker.get("current_step", 0)) for worker in active_workers
        ]
        if (
            state == "RUNNING"
            and ranks == {0, 1}
            and new_worker_ids.isdisjoint(old_worker_ids)
            and restored_steps
            and min(restored_steps) >= checkpoint_step
        ):
            assert saw_recovering, (
                "Run reported RUNNING without a visible recovery phase"
            )
            return
        time.sleep(1)

    pytest.fail(
        "Worker group did not return with ranks 0/1 restored from "
        f"checkpoint step {checkpoint_step}"
    )
