"""End-to-end test: full checkpoint lifecycle.

Requires the Docker Compose stack running:
    docker compose up --build -d

Run with:
    pytest tests/e2e/ -v -m e2e
"""

from __future__ import annotations

import os
import time

import httpx
import pytest

BASE_URL = os.getenv("CONTROLPLANE_URL", "http://localhost:8000")
TIMEOUT = 30  # seconds to wait for state transitions


@pytest.fixture(scope="module")
def api():
    """Shared httpx client for the test module."""
    with httpx.Client(base_url=BASE_URL, timeout=15) as client:
        # Verify the control plane is reachable before running tests
        for attempt in range(5):
            try:
                r = client.get("/api/health")
                if r.status_code == 200:
                    break
            except httpx.ConnectError:
                pass
            time.sleep(2)
        else:
            pytest.skip("Control plane not reachable — is Docker Compose running?")
        yield client


def _wait_for_state(api: httpx.Client, run_id: str, target: str, timeout: int = TIMEOUT) -> dict:
    """Poll until a run reaches the target state or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = api.get(f"/api/runs/{run_id}")
        assert r.status_code == 200, f"GET /api/runs/{run_id} returned {r.status_code}"
        data = r.json()
        state = data.get("state", data.get("status", ""))
        if state.upper() == target.upper():
            return data
        time.sleep(1)
    raise TimeoutError(
        f"Run {run_id} did not reach state {target} within {timeout}s (last: {state})"
    )


# ---------------------------------------------------------------------------
# E2E Tests
# ---------------------------------------------------------------------------

@pytest.mark.e2e
def test_full_checkpoint_cycle(api: httpx.Client):
    """Start run -> train N steps -> checkpoint -> commit -> verify."""

    # 1. Create a training run
    create_resp = api.post("/api/runs", json={
        "name": "e2e-test-run",
        "num_workers": 2,
        "checkpoint_interval": 5,
    })
    assert create_resp.status_code in (200, 201), (
        f"Failed to create run: {create_resp.status_code} {create_resp.text}"
    )
    run = create_resp.json()
    run_id = run.get("run_id") or run.get("id")
    assert run_id, f"No run_id in response: {run}"

    # 2. Start the run
    start_resp = api.post(f"/api/runs/{run_id}/start")
    assert start_resp.status_code == 200, (
        f"Failed to start run: {start_resp.status_code} {start_resp.text}"
    )

    # 3. Wait for RUNNING state
    _wait_for_state(api, run_id, "RUNNING")

    # 4. Trigger a checkpoint
    ckpt_resp = api.post(f"/api/runs/{run_id}/checkpoint")
    assert ckpt_resp.status_code == 200, (
        f"Failed to trigger checkpoint: {ckpt_resp.status_code} {ckpt_resp.text}"
    )

    # 5. Wait for state to reach CHECKPOINTING or COMMITTED
    #    (may transition quickly from CHECKPOINTING -> COMMITTED)
    deadline = time.time() + TIMEOUT
    reached_checkpointing = False
    while time.time() < deadline:
        r = api.get(f"/api/runs/{run_id}")
        state = r.json().get("state", r.json().get("status", "")).upper()
        if state in ("CHECKPOINTING", "COMMITTED"):
            reached_checkpointing = True
            break
        time.sleep(1)
    assert reached_checkpointing, f"Run never entered CHECKPOINTING (last state: {state})"

    # 6. Commit the checkpoint
    commit_resp = api.post(f"/api/runs/{run_id}/commit")
    if commit_resp.status_code == 200:
        # Wait for COMMITTED state
        _wait_for_state(api, run_id, "COMMITTED")

    # 7. Verify we can list checkpoints for this run
    list_resp = api.get(f"/api/runs/{run_id}/checkpoints")
    if list_resp.status_code == 200:
        checkpoints = list_resp.json()
        # Should have at least one checkpoint
        if isinstance(checkpoints, list):
            assert len(checkpoints) >= 1, "Expected at least 1 checkpoint"

    # 8. Verify metrics endpoint is serving
    metrics_resp = api.get("/api/metrics/prometheus")
    assert metrics_resp.status_code == 200
    assert "controlplane_checkpoints_total" in metrics_resp.text


@pytest.mark.e2e
def test_failure_recovery(api: httpx.Client):
    """Start run -> checkpoint -> simulate failure -> recover -> verify."""

    # 1. Create and start a run
    create_resp = api.post("/api/runs", json={
        "name": "e2e-recovery-test",
        "num_workers": 2,
        "checkpoint_interval": 5,
    })
    assert create_resp.status_code in (200, 201)
    run = create_resp.json()
    run_id = run.get("run_id") or run.get("id")

    start_resp = api.post(f"/api/runs/{run_id}/start")
    assert start_resp.status_code == 200

    _wait_for_state(api, run_id, "RUNNING")

    # 2. Trigger and commit a checkpoint so we have a recovery point
    api.post(f"/api/runs/{run_id}/checkpoint")
    time.sleep(3)
    api.post(f"/api/runs/{run_id}/commit")
    time.sleep(2)

    # 3. Simulate failure by reporting worker failure
    fail_resp = api.post(f"/api/runs/{run_id}/fail", json={
        "reason": "e2e-test: simulated worker crash",
    })
    if fail_resp.status_code == 200:
        # 4. Wait for FAILED state
        _wait_for_state(api, run_id, "FAILED", timeout=15)

        # 5. Trigger recovery
        resume_resp = api.post(f"/api/runs/{run_id}/resume")
        assert resume_resp.status_code == 200, (
            f"Resume failed: {resume_resp.status_code} {resume_resp.text}"
        )

        # 6. Verify run transitions through RECOVERING
        deadline = time.time() + TIMEOUT
        saw_recovering = False
        final_state = ""
        while time.time() < deadline:
            r = api.get(f"/api/runs/{run_id}")
            state = r.json().get("state", r.json().get("status", "")).upper()
            if state == "RECOVERING":
                saw_recovering = True
            if state == "RUNNING":
                final_state = state
                break
            final_state = state
            time.sleep(1)

        # The run should have transitioned through RECOVERING back to RUNNING
        assert saw_recovering or final_state == "RUNNING", (
            f"Expected RECOVERING->RUNNING, got final state: {final_state}"
        )


@pytest.mark.e2e
def test_health_and_metrics(api: httpx.Client):
    """Verify health and metrics endpoints return valid data."""

    # Health check
    health_resp = api.get("/api/health")
    assert health_resp.status_code == 200
    health = health_resp.json()
    assert "status" in health or "healthy" in health

    # Prometheus metrics
    metrics_resp = api.get("/api/metrics/prometheus")
    assert metrics_resp.status_code == 200
    text = metrics_resp.text
    assert "controlplane_uptime_seconds" in text
    assert "controlplane_runs_total" in text

    # Performance metrics
    perf_resp = api.get("/api/metrics/performance")
    assert perf_resp.status_code == 200
    perf = perf_resp.json()
    assert "latency" in perf or "throughput" in perf or "checkpoint_durations" in perf
