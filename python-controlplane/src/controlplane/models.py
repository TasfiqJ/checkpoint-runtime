"""Pydantic models for the checkpoint runtime control plane."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class RunState(str, Enum):
    """All possible states in the run lifecycle."""

    CREATED = "CREATED"
    RUNNING = "RUNNING"
    CHECKPOINTING = "CHECKPOINTING"
    COMMITTED = "COMMITTED"
    FAILED = "FAILED"
    RECOVERING = "RECOVERING"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class ShardingPolicy(str, Enum):
    """Policy for distributing data shards across workers."""

    HASH = "hash"
    RANGE = "range"
    ROUND_ROBIN = "round_robin"
    CUSTOM = "custom"


class RunConfig(BaseModel):
    """Configuration for creating a new run."""

    dataset_id: str = Field(..., description="Identifier of the dataset to process")
    sharding_policy: ShardingPolicy = Field(
        default=ShardingPolicy.HASH,
        description="How to distribute shards across workers",
    )
    num_workers: int = Field(default=1, ge=1, description="Number of workers to allocate")
    checkpoint_interval_seconds: int = Field(
        default=300, ge=0, description="Seconds between automatic checkpoints (0 = disabled)"
    )
    max_retries: int = Field(default=3, ge=0, description="Maximum retry attempts on failure")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary user metadata")
    timeout_seconds: int | None = Field(
        default=None, ge=1, description="Overall run timeout in seconds"
    )


class RunStatus(BaseModel):
    """Current status of a run."""

    run_id: UUID
    state: RunState
    config: RunConfig
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    checkpoint_count: int = 0
    current_checkpoint_id: UUID | None = None
    assigned_workers: list[UUID] = Field(default_factory=list)
    error_message: str | None = None
    progress_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CheckpointInfo(BaseModel):
    """Information about a stored checkpoint."""

    checkpoint_id: UUID
    run_id: UUID
    sequence_number: int = Field(ge=0, description="Monotonically increasing checkpoint index")
    created_at: datetime
    size_bytes: int = Field(ge=0)
    storage_path: str
    state_digest: str = Field(
        default="", description="SHA-256 digest of the checkpoint contents"
    )
    metadata: dict[str, Any] = Field(default_factory=dict)
    is_valid: bool = True


class WorkerInfo(BaseModel):
    """Information about a registered worker."""

    worker_id: UUID
    hostname: str
    port: int = Field(ge=1, le=65535)
    state: str = "idle"
    current_run_id: UUID | None = None
    last_heartbeat: datetime | None = None
    capacity: int = Field(default=1, ge=1, description="Max concurrent shards this worker handles")
    labels: dict[str, str] = Field(default_factory=dict)


class RunEvent(BaseModel):
    """An event emitted during a run's lifecycle."""

    event_id: UUID
    run_id: UUID
    timestamp: datetime
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)


class DatasetInfo(BaseModel):
    """Registered dataset metadata."""

    dataset_id: str
    name: str
    shard_count: int = Field(ge=1)
    total_size_bytes: int = Field(ge=0)
    registered_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class HealthStatus(BaseModel):
    """Health check response."""

    status: str = "ok"
    version: str = "0.1.0"
    uptime_seconds: float = 0.0
    worker_count: int = 0
    active_runs: int = 0


class MetricsSummary(BaseModel):
    """Aggregated metrics summary."""

    total_runs: int = 0
    active_runs: int = 0
    completed_runs: int = 0
    failed_runs: int = 0
    total_checkpoints: int = 0
    total_workers: int = 0
    avg_checkpoint_duration_ms: float = 0.0
    avg_run_duration_seconds: float = 0.0
