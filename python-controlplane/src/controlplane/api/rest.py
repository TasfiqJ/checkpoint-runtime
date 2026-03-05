"""FastAPI REST API for the checkpoint runtime control plane.

Endpoints
---------
Runs:
    GET   /api/runs                      - List all runs
    POST  /api/runs                      - Create a new run
    GET   /api/runs/{run_id}             - Get run status
    POST  /api/runs/{run_id}/start       - Start a run (CREATED -> RUNNING)
    POST  /api/runs/{run_id}/cancel      - Cancel a run
    POST  /api/runs/{run_id}/complete    - Mark a run as completed
    POST  /api/runs/{run_id}/checkpoint  - Trigger a checkpoint
    POST  /api/runs/{run_id}/commit      - Commit checkpoint (CHECKPOINTING -> COMMITTED)
    POST  /api/runs/{run_id}/resume      - Resume a failed/committed run
    GET   /api/runs/{run_id}/checkpoints - List checkpoints for a run
    GET   /api/runs/{run_id}/events      - Server-sent events for a run

Checkpoints:
    GET   /api/checkpoints/{checkpoint_id} - Get checkpoint details

Workers:
    GET   /api/workers                   - List all workers
    POST  /api/workers/register          - Register a new worker
    POST  /api/workers/{worker_id}/heartbeat  - Process worker heartbeat
    POST  /api/workers/{worker_id}/deregister - Deregister a worker

Datasets:
    POST  /api/datasets                  - Register a new dataset

Health & Metrics:
    GET   /api/health                    - Health check
    GET   /api/metrics/summary           - Aggregated metrics
    GET   /api/metrics/heartbeat-lags    - Heartbeat lag for all workers
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from controlplane.coordinator import Coordinator
from controlplane.heartbeat import HeartbeatConfig, HeartbeatManager
from controlplane.models import (
    CheckpointInfo,
    DatasetInfo,
    HealthStatus,
    HealthStatusLevel,
    MetricsSummary,
    RunConfig,
    RunState,
    RunStatus,
    ShardingPolicy,
    WorkerInfo,
)
from controlplane.recovery import RecoveryManager
from controlplane.state_machine import InvalidTransitionError
from controlplane.telemetry import TelemetryManager, get_telemetry_manager
from controlplane.worker_manager import WorkerManager

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start/stop Phase 3 subsystems."""
    coord: Coordinator = app.state.coordinator

    heartbeat_mgr = HeartbeatManager(config=HeartbeatConfig(), coordinator=coord)
    worker_mgr = WorkerManager(coordinator=coord, heartbeat_mgr=heartbeat_mgr)
    recovery_mgr = RecoveryManager(coordinator=coord, heartbeat_mgr=heartbeat_mgr)
    telemetry_mgr = get_telemetry_manager()
    telemetry_mgr.setup()

    app.state.heartbeat_mgr = heartbeat_mgr
    app.state.worker_mgr = worker_mgr
    app.state.recovery_mgr = recovery_mgr
    app.state.telemetry_mgr = telemetry_mgr

    await heartbeat_mgr.start_monitoring()
    logger.info("Phase 3 subsystems initialized")

    yield

    await heartbeat_mgr.stop_monitoring()
    telemetry_mgr.shutdown()
    logger.info("Phase 3 subsystems shut down")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


def create_app(coordinator: Coordinator | None = None, *, use_lifespan: bool = True) -> FastAPI:
    application = FastAPI(
        title="Checkpoint Runtime Control Plane",
        version="0.2.0",
        description="REST API for managing distributed training runs and checkpoints.",
        lifespan=lifespan if use_lifespan else None,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if coordinator is None:
        etcd_host = os.environ.get("ETCD_HOST", "localhost")
        etcd_port = int(os.environ.get("ETCD_PORT", "2379"))
        try:
            coordinator = Coordinator(etcd_host=etcd_host, etcd_port=etcd_port)
        except Exception:
            coordinator = Coordinator(use_memory=True)

    application.state.coordinator = coordinator
    application.state.event_subscribers = defaultdict(list)

    _register_routes(application)
    return application


def _get_coordinator(request: Request) -> Coordinator:
    return request.app.state.coordinator


def _get_worker_mgr(request: Request) -> WorkerManager | None:
    return getattr(request.app.state, "worker_mgr", None)


def _get_heartbeat_mgr(request: Request) -> HeartbeatManager | None:
    return getattr(request.app.state, "heartbeat_mgr", None)


def _get_subscribers(request: Request) -> dict[str, list[asyncio.Queue]]:
    return request.app.state.event_subscribers


def _publish_event(request: Request, run_id: str, event_type: str, data: str) -> None:
    subscribers = _get_subscribers(request).get(run_id, [])
    payload = {"event": event_type, "data": data}
    for queue in subscribers:
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            logger.warning("Dropping SSE event for run %s (queue full)", run_id)


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------


def _register_routes(application: FastAPI) -> None:

    # -- runs ---------------------------------------------------------------

    @application.get("/api/runs", response_model=list[RunStatus], tags=["runs"])
    async def list_runs(request: Request) -> list[RunStatus]:
        return _get_coordinator(request).list_runs()

    @application.post("/api/runs", response_model=RunStatus, status_code=201, tags=["runs"])
    async def create_run(config: RunConfig, request: Request) -> RunStatus:
        coord = _get_coordinator(request)
        status = coord.create_run(config)
        _publish_event(request, status.run_id, "run_created", status.model_dump_json())
        return status

    @application.get("/api/runs/{run_id}", response_model=RunStatus, tags=["runs"])
    async def get_run(run_id: str, request: Request) -> RunStatus:
        coord = _get_coordinator(request)
        status = coord.get_run(run_id)
        if status is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        return status

    @application.post("/api/runs/{run_id}/start", response_model=RunStatus, tags=["runs"])
    async def start_run(run_id: str, request: Request) -> RunStatus:
        coord = _get_coordinator(request)
        try:
            status = coord.transition_run(run_id, RunState.RUNNING)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        except InvalidTransitionError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        _publish_event(request, run_id, "run_started", status.model_dump_json())
        return status

    @application.post("/api/runs/{run_id}/cancel", response_model=RunStatus, tags=["runs"])
    async def cancel_run(run_id: str, request: Request) -> RunStatus:
        coord = _get_coordinator(request)
        try:
            status = coord.transition_run(run_id, RunState.CANCELLED)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        except InvalidTransitionError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        _publish_event(request, run_id, "run_cancelled", status.model_dump_json())
        return status

    @application.post("/api/runs/{run_id}/complete", response_model=RunStatus, tags=["runs"])
    async def complete_run(run_id: str, request: Request) -> RunStatus:
        coord = _get_coordinator(request)
        try:
            status = coord.transition_run(run_id, RunState.COMPLETED)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        except InvalidTransitionError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        _publish_event(request, run_id, "run_completed", status.model_dump_json())
        return status

    @application.post("/api/runs/{run_id}/checkpoint", response_model=CheckpointInfo, tags=["runs"])
    async def trigger_checkpoint(
        run_id: str, request: Request,
        step: int | None = Query(default=None),
    ) -> CheckpointInfo:
        coord = _get_coordinator(request)
        try:
            status = coord.transition_run(run_id, RunState.CHECKPOINTING)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        except InvalidTransitionError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

        effective_step = step if step is not None else status.current_step
        checkpoint = coord.create_checkpoint(run_id, effective_step)
        _publish_event(request, run_id, "checkpoint_started", checkpoint.model_dump_json())
        return checkpoint

    @application.post("/api/runs/{run_id}/commit", response_model=RunStatus, tags=["runs"])
    async def commit_run(run_id: str, request: Request) -> RunStatus:
        coord = _get_coordinator(request)
        try:
            status = coord.transition_run(run_id, RunState.COMMITTED)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        except InvalidTransitionError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        _publish_event(request, run_id, "checkpoint_committed", status.model_dump_json())
        return status

    @application.post("/api/runs/{run_id}/resume", response_model=RunStatus, tags=["runs"])
    async def resume_run(run_id: str, request: Request) -> RunStatus:
        coord = _get_coordinator(request)
        status = coord.get_run(run_id)
        if status is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")

        try:
            if status.state == RunState.FAILED:
                coord.transition_run(run_id, RunState.RECOVERING)
                status = coord.transition_run(run_id, RunState.RUNNING)
            elif status.state in (RunState.COMMITTED, RunState.CREATED):
                status = coord.transition_run(run_id, RunState.RUNNING)
            else:
                raise InvalidTransitionError(status.state, RunState.RUNNING)
        except InvalidTransitionError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

        _publish_event(request, run_id, "run_resumed", status.model_dump_json())
        return status

    @application.get("/api/runs/{run_id}/checkpoints", response_model=list[CheckpointInfo], tags=["checkpoints"])
    async def list_run_checkpoints(run_id: str, request: Request) -> list[CheckpointInfo]:
        coord = _get_coordinator(request)
        if coord.get_run(run_id) is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        return coord.list_checkpoints(run_id)

    # -- SSE events ---------------------------------------------------------

    @application.get("/api/runs/{run_id}/events", tags=["runs"])
    async def run_events(run_id: str, request: Request) -> StreamingResponse:
        coord = _get_coordinator(request)
        if coord.get_run(run_id) is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")

        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        _get_subscribers(request).setdefault(run_id, []).append(queue)

        async def event_stream() -> AsyncGenerator[str, None]:
            try:
                while True:
                    event = await queue.get()
                    yield f"event: {event['event']}\ndata: {event['data']}\n\n"
            except asyncio.CancelledError:
                pass
            finally:
                _get_subscribers(request).get(run_id, []).remove(queue)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    # -- checkpoints --------------------------------------------------------

    @application.get("/api/checkpoints/{checkpoint_id}", response_model=CheckpointInfo, tags=["checkpoints"])
    async def get_checkpoint(checkpoint_id: str, request: Request) -> CheckpointInfo:
        coord = _get_coordinator(request)
        info = coord.get_checkpoint(checkpoint_id)
        if info is None:
            raise HTTPException(status_code=404, detail=f"Checkpoint {checkpoint_id!r} not found")
        return info

    # -- workers ------------------------------------------------------------

    @application.get("/api/workers", response_model=list[WorkerInfo], tags=["workers"])
    async def list_workers(
        request: Request,
        run_id: str | None = Query(default=None),
    ) -> list[WorkerInfo]:
        worker_mgr = _get_worker_mgr(request)
        if worker_mgr:
            if run_id:
                return worker_mgr.get_run_workers(run_id)
            return worker_mgr.list_all_workers()
        return _get_coordinator(request).list_workers(run_id=run_id)

    @application.post("/api/workers/register", response_model=WorkerInfo, status_code=201, tags=["workers"])
    async def register_worker(request: Request) -> WorkerInfo:
        body = await request.json()
        run_id = body.get("run_id")
        hostname = body.get("hostname", "")

        worker_mgr = _get_worker_mgr(request)
        if worker_mgr:
            return worker_mgr.register_worker(run_id=run_id, hostname=hostname)
        return _get_coordinator(request).register_worker(
            run_id=run_id or "__unassigned__", rank=0, hostname=hostname,
        )

    @application.post("/api/workers/{worker_id}/heartbeat", tags=["workers"])
    async def worker_heartbeat(worker_id: str, request: Request) -> dict:
        body = await request.json()
        step = body.get("step", 0)

        worker_mgr = _get_worker_mgr(request)
        if worker_mgr:
            worker = worker_mgr.update_worker_heartbeat(worker_id, step=step)
            if worker is None:
                raise HTTPException(status_code=404, detail=f"Worker {worker_id!r} not found")
            return {"status": "ok", "worker_id": worker_id}

        raise HTTPException(status_code=503, detail="Worker manager not initialized")

    @application.post("/api/workers/{worker_id}/deregister", tags=["workers"])
    async def deregister_worker(worker_id: str, request: Request) -> dict:
        worker_mgr = _get_worker_mgr(request)
        if worker_mgr:
            worker_mgr.deregister_worker(worker_id)
            return {"status": "ok", "worker_id": worker_id}
        raise HTTPException(status_code=503, detail="Worker manager not initialized")

    # -- datasets -----------------------------------------------------------

    @application.post("/api/datasets", status_code=201, tags=["datasets"])
    async def register_dataset(request: Request) -> dict:
        body = await request.json()
        info = DatasetInfo(
            dataset_id=body.get("dataset_id", ""),
            uri=body.get("uri", ""),
            sharding_policy=ShardingPolicy(body.get("sharding_policy", "RANGE_SHARDING")),
            metadata=body.get("metadata", {}),
        )
        return info.model_dump(mode="json")

    # -- health & metrics ---------------------------------------------------

    @application.get("/api/health", response_model=HealthStatus, tags=["ops"])
    async def health_check(request: Request) -> HealthStatus:
        coord = _get_coordinator(request)
        runs = coord.list_runs()
        active = sum(1 for r in runs if r.state in {RunState.RUNNING, RunState.CHECKPOINTING})

        return HealthStatus(
            status=HealthStatusLevel.HEALTHY,
            version="0.2.0",
            uptime_seconds=round(coord.uptime_seconds, 2),
            active_runs=active,
            etcd_connected=coord.etcd_connected,
        )

    @application.get("/api/metrics/summary", response_model=MetricsSummary, tags=["ops"])
    async def metrics_summary(request: Request) -> MetricsSummary:
        coord = _get_coordinator(request)
        runs = coord.list_runs()
        active_runs = [r for r in runs if r.state in {RunState.RUNNING, RunState.CHECKPOINTING}]
        workers = coord.list_workers()
        active_workers = [w for w in workers if w.status == "ACTIVE"]

        total_checkpoints = 0
        total_bytes = 0
        committed = 0
        for run in runs:
            cps = coord.list_checkpoints(run.run_id)
            total_checkpoints += len(cps)
            for cp in cps:
                total_bytes += cp.total_bytes
                if cp.state == "COMMITTED":
                    committed += 1

        success_rate = (committed / total_checkpoints) if total_checkpoints > 0 else 0.0

        return MetricsSummary(
            total_runs=len(runs),
            active_runs=len(active_runs),
            total_checkpoints=total_checkpoints,
            total_checkpoint_bytes=total_bytes,
            total_workers=len(workers),
            active_workers=len(active_workers),
            checkpoint_success_rate=round(success_rate, 4),
        )

    @application.get("/api/metrics/heartbeat-lags", tags=["ops"])
    async def heartbeat_lags(request: Request) -> dict:
        hb_mgr = _get_heartbeat_mgr(request)
        if hb_mgr:
            return {"lags": hb_mgr.get_heartbeat_lags()}
        return {"lags": {}}


# ---------------------------------------------------------------------------
# Default app instance
# ---------------------------------------------------------------------------

app = create_app()
