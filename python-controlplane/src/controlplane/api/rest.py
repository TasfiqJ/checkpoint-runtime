"""FastAPI REST API for the checkpoint runtime control plane."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from controlplane.models import (
    CheckpointInfo,
    HealthStatus,
    MetricsSummary,
    RunConfig,
    RunEvent,
    RunState,
    RunStatus,
    WorkerInfo,
)

app = FastAPI(
    title="Checkpoint Runtime Control Plane",
    description="REST API for managing distributed checkpoint/restore workflows",
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# In-memory stores (replaced by real backends in production)
# ---------------------------------------------------------------------------
_runs: dict[UUID, RunStatus] = {}
_checkpoints: dict[UUID, CheckpointInfo] = {}
_workers: dict[UUID, WorkerInfo] = {}


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------

@app.get("/api/runs", response_model=list[RunStatus], tags=["runs"])
async def list_runs() -> list[RunStatus]:
    """Return all known runs."""
    return list(_runs.values())


@app.post("/api/runs", response_model=RunStatus, status_code=201, tags=["runs"])
async def create_run(config: RunConfig) -> RunStatus:
    """Create a new run from the given configuration."""
    now = datetime.now(timezone.utc)
    run = RunStatus(
        run_id=uuid4(),
        state=RunState.CREATED,
        config=config,
        created_at=now,
        updated_at=now,
    )
    _runs[run.run_id] = run
    return run


@app.get("/api/runs/{run_id}", response_model=RunStatus, tags=["runs"])
async def get_run(run_id: UUID) -> RunStatus:
    """Return status for a single run."""
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return _runs[run_id]


@app.post("/api/runs/{run_id}/cancel", response_model=RunStatus, tags=["runs"])
async def cancel_run(run_id: UUID) -> RunStatus:
    """Request cancellation of a run."""
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    run = _runs[run_id]
    if run.state in (RunState.CANCELLED, RunState.COMPLETED):
        raise HTTPException(
            status_code=409,
            detail=f"Run is already in terminal state {run.state.value}",
        )
    run.state = RunState.CANCELLED
    run.updated_at = datetime.now(timezone.utc)
    return run


@app.post("/api/runs/{run_id}/checkpoint", response_model=CheckpointInfo, tags=["runs"])
async def trigger_checkpoint(run_id: UUID) -> CheckpointInfo:
    """Trigger an ad-hoc checkpoint for the run."""
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    run = _runs[run_id]
    if run.state != RunState.RUNNING:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot checkpoint run in state {run.state.value}",
        )
    now = datetime.now(timezone.utc)
    ckpt = CheckpointInfo(
        checkpoint_id=uuid4(),
        run_id=run_id,
        sequence_number=run.checkpoint_count,
        created_at=now,
        size_bytes=0,
        storage_path=f"/checkpoints/{run_id}/{run.checkpoint_count}",
    )
    _checkpoints[ckpt.checkpoint_id] = ckpt
    run.checkpoint_count += 1
    run.current_checkpoint_id = ckpt.checkpoint_id
    run.updated_at = now
    return ckpt


@app.post("/api/runs/{run_id}/resume", response_model=RunStatus, tags=["runs"])
async def resume_run(run_id: UUID) -> RunStatus:
    """Resume a run from its latest checkpoint."""
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    run = _runs[run_id]
    if run.state not in (RunState.COMMITTED, RunState.FAILED):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot resume run in state {run.state.value}",
        )
    run.state = RunState.RUNNING if run.state == RunState.COMMITTED else RunState.RECOVERING
    run.updated_at = datetime.now(timezone.utc)
    return run


@app.get("/api/runs/{run_id}/checkpoints", response_model=list[CheckpointInfo], tags=["runs"])
async def list_run_checkpoints(run_id: UUID) -> list[CheckpointInfo]:
    """Return all checkpoints belonging to a run."""
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return [c for c in _checkpoints.values() if c.run_id == run_id]


@app.get("/api/runs/{run_id}/events", tags=["runs"])
async def stream_run_events(run_id: UUID) -> StreamingResponse:
    """Stream run lifecycle events via Server-Sent Events (SSE).

    This is a placeholder that emits a single heartbeat event then closes.
    A real implementation would subscribe to an event bus.
    """
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    async def _event_generator() -> AsyncGenerator[str, None]:
        event = RunEvent(
            event_id=uuid4(),
            run_id=run_id,
            timestamp=datetime.now(timezone.utc),
            event_type="heartbeat",
            payload={"message": "stream connected"},
        )
        yield f"event: {event.event_type}\ndata: {event.model_dump_json()}\n\n"
        # In production: yield from event bus subscription
        await asyncio.sleep(0)  # yield control once then close

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Checkpoints
# ---------------------------------------------------------------------------

@app.get("/api/checkpoints/{ckpt_id}", response_model=CheckpointInfo, tags=["checkpoints"])
async def get_checkpoint(ckpt_id: UUID) -> CheckpointInfo:
    """Return metadata for a single checkpoint."""
    if ckpt_id not in _checkpoints:
        raise HTTPException(status_code=404, detail=f"Checkpoint {ckpt_id} not found")
    return _checkpoints[ckpt_id]


# ---------------------------------------------------------------------------
# Workers
# ---------------------------------------------------------------------------

@app.get("/api/workers", response_model=list[WorkerInfo], tags=["workers"])
async def list_workers() -> list[WorkerInfo]:
    """Return all registered workers."""
    return list(_workers.values())


# ---------------------------------------------------------------------------
# Operational
# ---------------------------------------------------------------------------

@app.get("/api/health", response_model=HealthStatus, tags=["operational"])
async def health_check() -> HealthStatus:
    """Basic liveness / readiness probe."""
    active = sum(1 for r in _runs.values() if r.state == RunState.RUNNING)
    return HealthStatus(
        status="ok",
        version="0.1.0",
        worker_count=len(_workers),
        active_runs=active,
    )


@app.get("/api/metrics/summary", response_model=MetricsSummary, tags=["operational"])
async def metrics_summary() -> MetricsSummary:
    """Return an aggregated metrics snapshot."""
    runs = list(_runs.values())
    return MetricsSummary(
        total_runs=len(runs),
        active_runs=sum(1 for r in runs if r.state == RunState.RUNNING),
        completed_runs=sum(1 for r in runs if r.state == RunState.COMPLETED),
        failed_runs=sum(1 for r in runs if r.state == RunState.FAILED),
        total_checkpoints=len(_checkpoints),
        total_workers=len(_workers),
    )
