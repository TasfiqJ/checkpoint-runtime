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
    GET   /api/metrics/prometheus        - Prometheus exposition format
    GET   /api/metrics/performance       - Performance time series for frontend

Demo:
    GET   /api/demo/containers           - Live Docker container status
    GET   /api/demo/logs                 - SSE stream of container logs
    GET   /api/demo/storage              - MinIO file listing
    GET   /api/demo/storage/manifest     - Read a _manifest.json from MinIO
    POST  /api/demo/kill-worker/{name}   - Kill a worker container
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, Response, StreamingResponse

from controlplane.api.grpc_client import DataPlaneClient, ShardChunk, ShardInfo as GrpcShardInfo
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
from controlplane.telemetry import get_telemetry_manager
from controlplane.worker_manager import WorkerManager

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prometheus metrics (control plane side)
# ---------------------------------------------------------------------------

_METRICS: dict[str, float] = {
    "controlplane_runs_total": 0,
    "controlplane_active_runs": 0,
    "controlplane_checkpoints_total": 0,
    "controlplane_checkpoint_commits_total": 0,
    "controlplane_workers_total": 0,
    "controlplane_active_workers": 0,
}
_CHECKPOINT_DURATIONS: list[float] = []
_RESTORE_DURATIONS: list[float] = []
_HEARTBEAT_LAGS: dict[str, float] = {}
_APP_START_TIME: float = time.monotonic()
_CHECKPOINT_SHARDS: dict[str, list[GrpcShardInfo]] = {}  # checkpoint_id -> shard infos

# ---------------------------------------------------------------------------
# Visitor tracking + activity feed (live demo social features)
# ---------------------------------------------------------------------------

_VISITORS: dict[str, dict] = {}  # session_id -> {country, country_code, flag, last_seen, ip}
_ACTIVITY_FEED: list[dict] = []  # [{message, flag, timestamp}] max 50
_IP_COUNTRY_CACHE: dict[str, dict] = {}  # ip -> {country, country_code, flag}


def _ip_to_flag(country_code: str) -> str:
    """Convert 2-letter country code to flag emoji."""
    if not country_code or len(country_code) != 2:
        return "\U0001F310"  # 🌐 globe
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in country_code.upper())


async def _lookup_country(ip: str) -> dict:
    """Look up country from IP using ip-api.com (free, no key needed)."""
    if ip in _IP_COUNTRY_CACHE:
        return _IP_COUNTRY_CACHE[ip]

    # Skip private/local IPs
    if ip.startswith(("127.", "10.", "172.", "192.168.", "::1", "0.0.0.0")):
        result = {"country": "Local", "country_code": "", "flag": "\U0001F4BB"}  # 💻
        _IP_COUNTRY_CACHE[ip] = result
        return result

    import httpx
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"http://ip-api.com/json/{ip}?fields=country,countryCode",
            )
            if resp.status_code == 200:
                data = resp.json()
                code = data.get("countryCode", "")
                result = {
                    "country": data.get("country", "Unknown"),
                    "country_code": code,
                    "flag": _ip_to_flag(code),
                }
                _IP_COUNTRY_CACHE[ip] = result
                return result
    except Exception:
        pass

    result = {"country": "Unknown", "country_code": "", "flag": "\U0001F310"}
    _IP_COUNTRY_CACHE[ip] = result
    return result


def _add_activity(message: str, flag: str = "\U0001F310"):
    """Add an event to the activity feed (max 50 items)."""
    _ACTIVITY_FEED.insert(0, {
        "message": message,
        "flag": flag,
        "timestamp": time.time(),
    })
    if len(_ACTIVITY_FEED) > 50:
        _ACTIVITY_FEED.pop()


def _clean_stale_visitors():
    """Remove visitors who haven't pinged in 45 seconds."""
    now = time.time()
    stale = [sid for sid, v in _VISITORS.items() if now - v["last_seen"] > 45]
    for sid in stale:
        del _VISITORS[sid]


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start/stop Phase 3 subsystems."""
    global _APP_START_TIME
    _APP_START_TIME = time.monotonic()

    coord: Coordinator = app.state.coordinator

    heartbeat_mgr = HeartbeatManager(
        config=HeartbeatConfig(
            interval_seconds=5.0,
            timeout_seconds=10.0,
            dead_threshold_seconds=15.0,
            monitor_poll_seconds=3.0,
        ),
        coordinator=coord,
    )
    worker_mgr = WorkerManager(coordinator=coord, heartbeat_mgr=heartbeat_mgr)
    recovery_mgr = RecoveryManager(coordinator=coord, heartbeat_mgr=heartbeat_mgr)
    telemetry_mgr = get_telemetry_manager()
    telemetry_mgr.setup()

    # Connect to data plane gRPC
    dp_address = os.environ.get("DATAPLANE_GRPC_URL",
                                   os.environ.get("DATAPLANE_GRPC_ADDRESS", "rust-dataplane:50051"))
    dp_client = DataPlaneClient(address=dp_address)
    try:
        await dp_client.connect()
        logger.info("Connected to data plane gRPC at %s", dp_address)
    except Exception:
        logger.warning(
            "Could not connect to data plane at %s — ops will fail",
            dp_address,
        )

    app.state.heartbeat_mgr = heartbeat_mgr
    app.state.worker_mgr = worker_mgr
    app.state.recovery_mgr = recovery_mgr
    app.state.telemetry_mgr = telemetry_mgr
    app.state.dp_client = dp_client

    await heartbeat_mgr.start_monitoring()
    logger.info("Phase 3 subsystems initialized")

    yield

    await dp_client.close()
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


def _get_dp_client(request: Request) -> DataPlaneClient | None:
    return getattr(request.app.state, "dp_client", None)


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

    @application.post(
        "/api/runs/{run_id}/checkpoint",
        response_model=CheckpointInfo,
        tags=["runs"],
    )
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

        # Notify data plane to prepare for shard writes
        dp = _get_dp_client(request)
        if dp and dp.connected:
            try:
                health = await dp.health_check()
                logger.info(
                    "Data plane health: healthy=%s queue_depth=%d",
                    health.healthy, health.queue_depth,
                )
            except Exception as exc:
                logger.warning("Data plane health check failed: %s", exc)

        _publish_event(request, run_id, "checkpoint_started", checkpoint.model_dump_json())
        return checkpoint

    @application.post("/api/runs/{run_id}/commit", response_model=RunStatus, tags=["runs"])
    async def commit_run(run_id: str, request: Request) -> RunStatus:
        coord = _get_coordinator(request)
        run_status = coord.get_run(run_id)
        if run_status is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")

        # Commit checkpoint to the data plane
        dp = _get_dp_client(request)
        checkpoints = coord.list_checkpoints(run_id)
        active_cp = next((cp for cp in reversed(checkpoints) if cp.state == "IN_PROGRESS"), None)

        if dp and dp.connected and active_cp:
            checkpoint_start = time.monotonic()
            try:
                # Use shard infos tracked during upload
                shard_infos = _CHECKPOINT_SHARDS.get(active_cp.checkpoint_id, [])

                result = await dp.commit_checkpoint(
                    checkpoint_id=active_cp.checkpoint_id,
                    run_id=run_id,
                    step=active_cp.step,
                    shards=shard_infos,
                )
                if not result.success:
                    logger.error("Data plane commit failed: %s", result.error_message)
                    raise HTTPException(
                        status_code=500,
                        detail=f"Commit failed: {result.error_message}",
                    )

                _CHECKPOINT_DURATIONS.append(time.monotonic() - checkpoint_start)
                logger.info("Checkpoint %s committed to data plane", active_cp.checkpoint_id)

                # Clean up tracked shard infos to prevent memory leak
                _CHECKPOINT_SHARDS.pop(active_cp.checkpoint_id, None)
            except HTTPException:
                raise
            except Exception as exc:
                logger.warning("Data plane commit call failed: %s", exc)
                _CHECKPOINT_SHARDS.pop(active_cp.checkpoint_id, None)

        # Mark the checkpoint as COMMITTED in the coordinator
        if active_cp:
            coord.update_checkpoint_state(active_cp.checkpoint_id, "COMMITTED")

        try:
            coord.transition_run(run_id, RunState.COMMITTED)
            # Auto-resume back to RUNNING so the next checkpoint can be triggered
            status = coord.transition_run(run_id, RunState.RUNNING)
        except InvalidTransitionError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

        _METRICS["controlplane_checkpoint_commits_total"] += 1
        _publish_event(request, run_id, "checkpoint_committed", status.model_dump_json())
        return status

    @application.post("/api/runs/{run_id}/resume", response_model=RunStatus, tags=["runs"])
    async def resume_run(run_id: str, request: Request) -> RunStatus:
        coord = _get_coordinator(request)
        status = coord.get_run(run_id)
        if status is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")

        # Look up last committed checkpoint for recovery
        dp = _get_dp_client(request)
        last_checkpoint = None
        if status.state == RunState.FAILED and dp and dp.connected:
            checkpoints = coord.list_checkpoints(run_id)
            committed = [cp for cp in checkpoints if cp.state == "COMMITTED"]
            if committed:
                last_checkpoint = committed[-1]
                logger.info(
                    "Resuming from checkpoint %s (step %d)",
                    last_checkpoint.checkpoint_id, last_checkpoint.step,
                )

        try:
            if status.state == RunState.FAILED:
                coord.transition_run(run_id, RunState.RECOVERING)
                status = coord.transition_run(run_id, RunState.RUNNING)
            elif status.state == RunState.RUNNING:
                pass  # Already running — no-op for idempotent resume
            elif status.state in (RunState.COMMITTED, RunState.CREATED, RunState.CHECKPOINTING):
                status = coord.transition_run(run_id, RunState.RUNNING)
            else:
                raise InvalidTransitionError(status.state, RunState.RUNNING)
        except InvalidTransitionError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

        _publish_event(request, run_id, "run_resumed", status.model_dump_json())
        return status

    @application.post("/api/runs/{run_id}/fail", response_model=RunStatus, tags=["runs"])
    async def fail_run(run_id: str, request: Request) -> RunStatus:
        """Manually fail a run (for demo/testing)."""
        coord = _get_coordinator(request)
        try:
            body = await request.json()
        except Exception:
            body = {}
        reason = body.get("reason", "Manual failure trigger")
        try:
            status = coord.set_run_error(run_id, reason)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        except InvalidTransitionError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        _publish_event(request, run_id, "run_failed", status.model_dump_json())
        return status

    @application.get(
        "/api/runs/{run_id}/checkpoints",
        response_model=list[CheckpointInfo],
        tags=["checkpoints"],
    )
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
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # -- checkpoints --------------------------------------------------------

    @application.get(
        "/api/checkpoints/{checkpoint_id}",
        response_model=CheckpointInfo,
        tags=["checkpoints"],
    )
    async def get_checkpoint(checkpoint_id: str, request: Request) -> CheckpointInfo:
        coord = _get_coordinator(request)
        info = coord.get_checkpoint(checkpoint_id)
        if info is None:
            raise HTTPException(status_code=404, detail=f"Checkpoint {checkpoint_id!r} not found")
        return info

    # -- shard data transfer ------------------------------------------------

    @application.post(
        "/api/runs/{run_id}/checkpoints/{checkpoint_id}/shards/{shard_id}",
        tags=["checkpoints"],
    )
    async def upload_shard(
        run_id: str, checkpoint_id: str, shard_id: str, request: Request,
    ) -> dict:
        """Receive shard bytes from SDK and stream them to the data plane via gRPC."""
        dp = _get_dp_client(request)
        if not dp or not dp.connected:
            raise HTTPException(status_code=503, detail="Data plane not available")

        coord = _get_coordinator(request)
        cp = coord.get_checkpoint(checkpoint_id)
        if cp is None:
            raise HTTPException(status_code=404, detail=f"Checkpoint {checkpoint_id!r} not found")

        body = await request.body()
        rank = int(request.headers.get("X-Shard-Rank", "0"))

        # Stream the data to the data plane in 4MB chunks
        chunk_size = 4 * 1024 * 1024

        # ShardChunk proto doesn't carry run_id, so we encode it as
        # "{run_id}/{checkpoint_id}" in the checkpoint_id field.  The Rust
        # data plane splits on '/' to recover both values.
        composite_cp_id = f"{run_id}/{checkpoint_id}"

        async def chunk_iterator():
            offset = 0
            while offset < len(body):
                end = min(offset + chunk_size, len(body))
                yield ShardChunk(
                    shard_id=shard_id,
                    checkpoint_id=composite_cp_id,
                    offset=offset,
                    data=body[offset:end],
                    is_last=(end >= len(body)),
                )
                offset = end

        result = await dp.write_shard(chunk_iterator())

        # Track shard info for commit — use the same content-addressed key
        # format as the Rust data plane writer (writer.rs:content_addressed_key)
        storage_key = (
            f"{run_id}/{checkpoint_id}/"
            f"sha256-{result.sha256_checksum[:16]}-{shard_id}.bin"
        )
        shard_info = GrpcShardInfo(
            shard_id=shard_id,
            rank=rank,
            size_bytes=result.total_bytes,
            sha256=result.sha256_checksum,
            storage_key=storage_key,
        )
        _CHECKPOINT_SHARDS.setdefault(checkpoint_id, []).append(shard_info)

        # Update checkpoint metadata
        existing_shards = _CHECKPOINT_SHARDS.get(checkpoint_id, [])
        coord.update_checkpoint_state(
            checkpoint_id,
            "IN_PROGRESS",
            num_shards=len(existing_shards),
            total_bytes=sum(s.size_bytes for s in existing_shards),
            shard_ids=[s.shard_id for s in existing_shards],
        )

        logger.info(
            "Shard uploaded: shard_id=%s checkpoint=%s bytes=%d sha256=%s",
            shard_id, checkpoint_id, result.total_bytes, result.sha256_checksum[:16],
        )

        return {
            "shard_id": result.shard_id,
            "total_bytes": result.total_bytes,
            "sha256_checksum": result.sha256_checksum,
            "success": result.success,
        }

    @application.get(
        "/api/runs/{run_id}/checkpoints/{checkpoint_id}/shards/{shard_id}",
        tags=["checkpoints"],
    )
    async def download_shard(
        run_id: str, checkpoint_id: str, shard_id: str, request: Request,
    ) -> Response:
        """Download shard bytes from the data plane back to the SDK."""
        dp = _get_dp_client(request)
        if not dp or not dp.connected:
            raise HTTPException(status_code=503, detail="Data plane not available")

        restore_start = time.monotonic()
        chunks: list[bytes] = []
        async for chunk in dp.read_shard(shard_id, checkpoint_id, run_id):
            chunks.append(chunk.data)
        _RESTORE_DURATIONS.append(time.monotonic() - restore_start)

        if not chunks:
            raise HTTPException(status_code=404, detail=f"Shard {shard_id} has no data")

        return Response(content=b"".join(chunks), media_type="application/octet-stream")

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

    @application.post(
        "/api/workers/register",
        response_model=WorkerInfo,
        status_code=201,
        tags=["workers"],
    )
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

        dp = _get_dp_client(request)
        return HealthStatus(
            status=HealthStatusLevel.HEALTHY,
            version="0.2.0",
            uptime_seconds=round(coord.uptime_seconds, 2),
            active_runs=active,
            etcd_connected=coord.etcd_connected,
            dataplane_connected=bool(dp and dp.connected),
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
            lags = hb_mgr.get_heartbeat_lags()
            _HEARTBEAT_LAGS.update(lags)
            return {"lags": lags}
        return {"lags": {}}

    @application.get("/api/metrics/prometheus", tags=["ops"])
    async def prometheus_metrics(request: Request) -> PlainTextResponse:
        """Expose metrics in Prometheus text exposition format."""
        coord = _get_coordinator(request)
        runs = coord.list_runs()
        workers = coord.list_workers()
        active_runs = sum(1 for r in runs if r.state in {RunState.RUNNING, RunState.CHECKPOINTING})
        active_workers = sum(1 for w in workers if w.status == "ACTIVE")

        total_checkpoints = 0
        committed = 0
        for run in runs:
            cps = coord.list_checkpoints(run.run_id)
            total_checkpoints += len(cps)
            for cp in cps:
                if cp.state == "COMMITTED":
                    committed += 1

        lines = [
            "# HELP controlplane_runs_total Total number of training runs",
            "# TYPE controlplane_runs_total gauge",
            f"controlplane_runs_total {len(runs)}",
            "",
            "# HELP controlplane_active_runs Number of currently active runs",
            "# TYPE controlplane_active_runs gauge",
            f"controlplane_active_runs {active_runs}",
            "",
            "# HELP controlplane_workers_total Total registered workers",
            "# TYPE controlplane_workers_total gauge",
            f"controlplane_workers_total {len(workers)}",
            "",
            "# HELP controlplane_active_workers Number of active workers",
            "# TYPE controlplane_active_workers gauge",
            f"controlplane_active_workers {active_workers}",
            "",
            "# HELP controlplane_checkpoints_total Total checkpoints created",
            "# TYPE controlplane_checkpoints_total gauge",
            f"controlplane_checkpoints_total {total_checkpoints}",
            "",
            "# HELP controlplane_checkpoint_commits_total Total committed checkpoints",
            "# TYPE controlplane_checkpoint_commits_total counter",
            f"controlplane_checkpoint_commits_total {committed}",
            "",
        ]

        # Per-state run counts
        lines.append("# HELP controlplane_runs_by_state Runs by state")
        lines.append("# TYPE controlplane_runs_by_state gauge")
        state_counts: dict[str, int] = defaultdict(int)
        for r in runs:
            state_counts[r.state.value if hasattr(r.state, "value") else str(r.state)] += 1
        for state, count in sorted(state_counts.items()):
            lines.append(f'controlplane_runs_by_state{{state="{state}"}} {count}')
        lines.append("")

        # Checkpoint duration histogram (simplified: sum + count)
        if _CHECKPOINT_DURATIONS:
            total = sum(_CHECKPOINT_DURATIONS)
            count = len(_CHECKPOINT_DURATIONS)
            lines.extend([
                "# HELP controlplane_checkpoint_duration_seconds Checkpoint commit duration",
                "# TYPE controlplane_checkpoint_duration_seconds summary",
                f"controlplane_checkpoint_duration_seconds_sum {total:.4f}",
                f"controlplane_checkpoint_duration_seconds_count {count}",
                "",
            ])

        # Worker heartbeat lags
        hb_mgr = _get_heartbeat_mgr(request)
        if hb_mgr:
            lags = hb_mgr.get_heartbeat_lags()
            if lags:
                metric = "controlplane_worker_heartbeat_lag_seconds"
                lines.append(f"# HELP {metric} Heartbeat lag per worker")
                lines.append(f"# TYPE {metric} gauge")
                for worker_id, lag in lags.items():
                    lines.append(f'{metric}{{worker_id="{worker_id}"}} {lag:.2f}')
                lines.append("")

        # Uptime
        uptime = time.monotonic() - _APP_START_TIME
        lines.extend([
            "# HELP controlplane_uptime_seconds Control plane uptime",
            "# TYPE controlplane_uptime_seconds gauge",
            f"controlplane_uptime_seconds {uptime:.2f}",
        ])

        return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")

    @application.get("/api/metrics/performance", tags=["ops"])
    async def performance_metrics(request: Request) -> dict:
        """Return performance time-series data for the frontend."""
        coord = _get_coordinator(request)

        # Aggregate checkpoint durations as latency data
        latency_data = []
        for i, duration in enumerate(_CHECKPOINT_DURATIONS[-30:]):
            restore = _RESTORE_DURATIONS[i] if i < len(_RESTORE_DURATIONS) else 0.0
            latency_data.append({
                "index": i,
                "save": round(duration, 3),
                "restore": round(restore, 3),
            })

        # Get summary metrics for throughput
        runs = coord.list_runs()
        total_bytes = 0
        for run in runs:
            for cp in coord.list_checkpoints(run.run_id):
                total_bytes += cp.total_bytes

        return {
            "latency": latency_data,
            "total_checkpoint_bytes": total_bytes,
            "checkpoint_count": len(_CHECKPOINT_DURATIONS),
        }

    # -- demo control -------------------------------------------------------

    @application.get("/api/demo/system", tags=["demo"])
    async def demo_system_info() -> dict:
        """Return host system information — proves this runs on real hardware."""
        import subprocess, platform

        def _run(cmd: list[str]) -> str:
            try:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
                return r.stdout.strip()
            except Exception:
                return "N/A"

        # CPU info
        cpu_info = "N/A"
        try:
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.startswith("model name"):
                        cpu_info = line.split(":", 1)[1].strip()
                        break
        except FileNotFoundError:
            cpu_info = platform.processor() or "N/A"

        # CPU count
        cpu_count = os.cpu_count() or 0

        # Memory info
        mem_total = mem_available = "N/A"
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal"):
                        kb = int(line.split()[1])
                        mem_total = f"{kb / 1024 / 1024:.1f} GB"
                    elif line.startswith("MemAvailable"):
                        kb = int(line.split()[1])
                        mem_available = f"{kb / 1024:.0f} MB"
        except FileNotFoundError:
            pass

        # Disk usage
        disk_info = "N/A"
        try:
            import shutil
            usage = shutil.disk_usage("/")
            disk_info = f"{usage.used / 1024**3:.1f} GB / {usage.total / 1024**3:.1f} GB"
        except Exception:
            pass

        # Docker version
        docker_version = _run(["docker", "--version"])

        # Container count
        container_count = _run(["docker", "ps", "-q"]).count("\n") + 1 if _run(["docker", "ps", "-q"]) else 0

        return {
            "hostname": platform.node(),
            "os": _run(["uname", "-sr"]) or f"{platform.system()} {platform.release()}",
            "arch": platform.machine(),
            "cpu": cpu_info,
            "cpu_count": cpu_count,
            "memory_total": mem_total,
            "memory_available": mem_available,
            "disk": disk_info,
            "uptime": _run(["uptime", "-p"]),
            "docker_version": docker_version,
            "container_count": container_count,
            "python_version": platform.python_version(),
        }

    @application.get("/api/demo/containers", tags=["demo"])
    async def demo_containers() -> list[dict]:
        """Return live Docker container status for the compose stack."""
        import subprocess, json as _json

        try:
            result = subprocess.run(
                ["docker", "ps", "-a", "--format", "{{json .}}",
                 "--filter", "label=com.docker.compose.project"],
                capture_output=True, text=True, timeout=5,
            )
            containers = []
            for line in result.stdout.strip().splitlines():
                if not line:
                    continue
                c = _json.loads(line)
                containers.append({
                    "name": c.get("Names", ""),
                    "image": c.get("Image", ""),
                    "status": c.get("Status", ""),
                    "state": c.get("State", ""),
                    "ports": c.get("Ports", ""),
                })
            return containers
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return []

    @application.get("/api/demo/logs", tags=["demo"])
    async def demo_logs(
        containers: str = "ckpt-worker-0,ckpt-controlplane,ckpt-dataplane",
        tail: int = 30,
    ):
        """Stream live Docker container logs as Server-Sent Events."""

        container_list = [
            c.strip() for c in containers.split(",")
            if c.strip() in {
                "ckpt-worker-0", "ckpt-worker-1", "ckpt-controlplane",
                "ckpt-dataplane", "ckpt-etcd", "ckpt-minio",
            }
        ]
        if not container_list:
            raise HTTPException(status_code=400, detail="No valid containers specified")

        import json as _json

        async def stream():
            processes: list[tuple[str, asyncio.subprocess.Process]] = []

            try:
                for cname in container_list:
                    proc = await asyncio.create_subprocess_exec(
                        "docker", "logs", "--tail", str(tail), "--follow",
                        "--timestamps", cname,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.STDOUT,
                    )
                    processes.append((cname, proc))

                async def read_lines(name: str, proc: asyncio.subprocess.Process):
                    assert proc.stdout is not None
                    async for raw_line in proc.stdout:
                        line = raw_line.decode("utf-8", errors="replace").rstrip()
                        if line:
                            yield name, line

                # Merge all container streams via asyncio
                import asyncio as _aio

                queues: asyncio.Queue[tuple[str, str] | None] = asyncio.Queue()

                async def reader(name: str, proc: asyncio.subprocess.Process):
                    async for n, l in read_lines(name, proc):
                        await queues.put((n, l))
                    await queues.put(None)

                tasks = [_aio.create_task(reader(n, p)) for n, p in processes]
                done_count = 0

                while done_count < len(tasks):
                    item = await queues.get()
                    if item is None:
                        done_count += 1
                        continue
                    name, line = item
                    payload = _json.dumps({"container": name, "line": line})
                    yield f"data: {payload}\n\n"

            finally:
                for _, proc in processes:
                    try:
                        proc.kill()
                    except ProcessLookupError:
                        pass

        return StreamingResponse(stream(), media_type="text/event-stream", headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        })

    @application.get("/api/demo/storage", tags=["demo"])
    async def demo_storage() -> dict:
        """List files in the MinIO checkpoints bucket."""
        import boto3
        from botocore.config import Config as BotoConfig

        s3_endpoint = os.environ.get("S3_ENDPOINT", "http://minio:9000")
        s3_bucket = os.environ.get("S3_BUCKET", "checkpoints")
        s3_access = os.environ.get("S3_ACCESS_KEY", os.environ.get("AWS_ACCESS_KEY_ID", "minioadmin"))
        s3_secret = os.environ.get("S3_SECRET_KEY", os.environ.get("AWS_SECRET_ACCESS_KEY", "minioadmin"))

        try:
            s3 = boto3.client(
                "s3",
                endpoint_url=s3_endpoint,
                aws_access_key_id=s3_access,
                aws_secret_access_key=s3_secret,
                config=BotoConfig(signature_version="s3v4"),
                region_name="us-east-1",
            )
            resp = s3.list_objects_v2(Bucket=s3_bucket, MaxKeys=500)
            files = []
            total_bytes = 0
            for obj in resp.get("Contents", []):
                files.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "modified": obj["LastModified"].isoformat(),
                })
                total_bytes += obj["Size"]
            return {"files": files, "total_bytes": total_bytes}
        except Exception as exc:
            logger.warning("Failed to list MinIO storage: %s", exc)
            return {"files": [], "total_bytes": 0, "error": str(exc)}

    @application.get("/api/demo/storage/manifest", tags=["demo"])
    async def demo_storage_manifest(key: str = Query(...)) -> dict:
        """Read a _manifest.json file from MinIO and return its content."""
        import boto3, json as _json
        from botocore.config import Config as BotoConfig

        if not key.endswith("_manifest.json"):
            raise HTTPException(status_code=400, detail="Only _manifest.json files can be read")

        s3_endpoint = os.environ.get("S3_ENDPOINT", "http://minio:9000")
        s3_bucket = os.environ.get("S3_BUCKET", "checkpoints")
        s3_access = os.environ.get("S3_ACCESS_KEY", os.environ.get("AWS_ACCESS_KEY_ID", "minioadmin"))
        s3_secret = os.environ.get("S3_SECRET_KEY", os.environ.get("AWS_SECRET_ACCESS_KEY", "minioadmin"))

        try:
            s3 = boto3.client(
                "s3",
                endpoint_url=s3_endpoint,
                aws_access_key_id=s3_access,
                aws_secret_access_key=s3_secret,
                config=BotoConfig(signature_version="s3v4"),
                region_name="us-east-1",
            )
            obj = s3.get_object(Bucket=s3_bucket, Key=key)
            content = obj["Body"].read().decode("utf-8")
            return _json.loads(content)
        except Exception as exc:
            raise HTTPException(status_code=404, detail=f"Manifest not found: {exc}")

    @application.post("/api/demo/kill-worker/{container_name}", tags=["demo"])
    async def demo_kill_worker(container_name: str, request: Request) -> dict:
        """Kill a Docker container by name (for live demo)."""
        import subprocess

        # Only allow killing known worker containers
        ALLOWED_CONTAINERS = {"ckpt-worker-0", "ckpt-worker-1"}
        if container_name not in ALLOWED_CONTAINERS:
            raise HTTPException(
                status_code=400,
                detail=f"Container {container_name!r} not in allowed list: {ALLOWED_CONTAINERS}",
            )

        try:
            kill_result = subprocess.run(
                ["docker", "kill", container_name],
                capture_output=True, text=True, timeout=10,
            )
            if kill_result.returncode != 0:
                return {"killed": container_name, "success": False, "output": kill_result.stderr.strip()}

            # Record kill in activity feed with visitor's country
            forwarded = request.headers.get("x-forwarded-for", "")
            client_ip = forwarded.split(",")[0].strip() if forwarded else (
                request.client.host if request.client else "0.0.0.0"
            )
            geo = await _lookup_country(client_ip)
            worker_label = container_name.replace("ckpt-", "")
            _add_activity(
                f"Someone from {geo['country']} just killed {worker_label}!",
                geo["flag"],
            )

            # Auto-restart the container after a brief delay so
            # the worker can recover from the latest checkpoint.
            import asyncio

            async def _restart():
                await asyncio.sleep(3)
                subprocess.run(
                    ["docker", "start", container_name],
                    capture_output=True, text=True, timeout=10,
                )
                logger.info("Auto-restarted %s after kill", container_name)

            asyncio.create_task(_restart())

            return {
                "killed": container_name,
                "success": True,
                "output": kill_result.stdout.strip(),
            }
        except FileNotFoundError:
            raise HTTPException(
                status_code=503,
                detail="Docker CLI not available in this container",
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Docker kill timed out")

    # -- visitor tracking + activity feed ------------------------------------

    @application.post("/api/demo/visitors/ping", tags=["demo"])
    async def demo_visitor_ping(request: Request) -> dict:
        """Register/update a visitor and return live stats."""
        import json as _json

        # Get client IP
        forwarded = request.headers.get("x-forwarded-for", "")
        client_ip = forwarded.split(",")[0].strip() if forwarded else (
            request.client.host if request.client else "0.0.0.0"
        )

        # Get or create session ID from request body
        try:
            body = await request.json()
            session_id = body.get("session_id", "")
        except Exception:
            session_id = ""

        if not session_id:
            import uuid
            session_id = str(uuid.uuid4())

        # Look up country
        geo = await _lookup_country(client_ip)

        # Update visitor
        is_new = session_id not in _VISITORS
        _VISITORS[session_id] = {
            "country": geo["country"],
            "country_code": geo["country_code"],
            "flag": geo["flag"],
            "last_seen": time.time(),
            "ip": client_ip,
        }

        # Add "joined" activity for new visitors
        if is_new:
            _add_activity(
                f"Someone from {geo['country']} is watching the demo",
                geo["flag"],
            )

        # Clean stale visitors
        _clean_stale_visitors()

        # Build response
        country_counts: dict[str, dict] = {}
        for v in _VISITORS.values():
            cc = v["country_code"] or "XX"
            if cc not in country_counts:
                country_counts[cc] = {
                    "country": v["country"],
                    "country_code": cc,
                    "flag": v["flag"],
                    "count": 0,
                }
            country_counts[cc]["count"] += 1

        return {
            "session_id": session_id,
            "total_visitors": len(_VISITORS),
            "countries": sorted(country_counts.values(), key=lambda x: -x["count"]),
            "activity": _ACTIVITY_FEED[:20],
        }

    @application.get("/api/demo/activity", tags=["demo"])
    async def demo_activity_feed() -> dict:
        """Return recent activity feed."""
        _clean_stale_visitors()
        return {
            "total_visitors": len(_VISITORS),
            "activity": _ACTIVITY_FEED[:20],
        }



# ---------------------------------------------------------------------------
# Default app instance
# ---------------------------------------------------------------------------

app = create_app()
