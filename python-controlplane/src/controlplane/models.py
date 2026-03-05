"""Pydantic domain models for the checkpoint runtime control plane.

These models define the canonical representations of runs, checkpoints,
workers, and related configuration shared across the REST API, coordinator,
and SDK.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class RunState(str, enum.Enum):
    """Lifecycle states for a training run."""

    CREATED = "CREATED"
    RUNNING = "RUNNING"
    CHECKPOINTING = "CHECKPOINTING"
    COMMITTED = "COMMITTED"
    FAILED = "FAILED"
    RECOVERING = "RECOVERING"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class ShardingPolicy(str, enum.Enum):
    """How dataset shards are distributed across workers."""

    FULL_REPLICATION = "FULL_REPLICATION"
    RANGE_SHARDING = "RANGE_SHARDING"
    HASH_SHARDING = "HASH_SHARDING"
    ROUND_ROBIN = "ROUND_ROBIN"


class HealthStatusLevel(str, enum.Enum):
    """Service health levels."""

    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    UNHEALTHY = "UNHEALTHY"


# ---------------------------------------------------------------------------
# Core domain models
# ---------------------------------------------------------------------------


class RunConfig(BaseModel):
    """Configuration supplied when creating a new training run."""

    name: str = Field(..., min_length=1, max_length=256)
    num_workers: int = Field(..., gt=0)
    sharding_policy: ShardingPolicy = Field(default=ShardingPolicy.RANGE_SHARDING)
    checkpoint_interval_steps: int = Field(default=500, gt=0)
    max_steps: int | None = Field(default=None, gt=0)
    dataset_id: str | None = Field(default=None)
    metadata: dict[str, str] = Field(default_factory=dict)


class RunStatus(BaseModel):
    """Live status of a training run."""

    run_id: str
    name: str
    state: RunState
    current_step: int = 0
    num_workers: int = 0
    active_workers: int = 0
    created_at: datetime
    updated_at: datetime
    config: RunConfig
    last_checkpoint_id: str | None = None
    error_message: str | None = None
    metadata: dict[str, str] = Field(default_factory=dict)


class CheckpointInfo(BaseModel):
    """Metadata about a single checkpoint."""

    checkpoint_id: str
    run_id: str
    step: int
    state: str = "PENDING"  # PENDING | IN_PROGRESS | COMMITTED | FAILED
    num_shards: int = 0
    total_bytes: int = 0
    created_at: datetime
    committed_at: datetime | None = None
    shard_ids: list[str] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)


class WorkerInfo(BaseModel):
    """Information about a registered worker in a training run."""

    worker_id: str
    run_id: str
    rank: int
    hostname: str = ""
    status: str = "ACTIVE"  # ACTIVE | DRAINING | DEAD
    last_heartbeat: datetime | None = None
    current_step: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class DatasetInfo(BaseModel):
    """Metadata about a registered dataset."""

    dataset_id: str
    uri: str
    total_size_bytes: int = 0
    num_shards: int = 0
    sharding_policy: ShardingPolicy = ShardingPolicy.RANGE_SHARDING
    created_at: datetime | None = None
    metadata: dict[str, str] = Field(default_factory=dict)


class RunEvent(BaseModel):
    """An event emitted during a run's lifecycle."""

    event_type: str
    run_id: str
    timestamp: datetime
    payload: dict[str, Any] = Field(default_factory=dict)


class HealthStatus(BaseModel):
    """Overall health status of the control plane."""

    status: HealthStatusLevel = HealthStatusLevel.HEALTHY
    version: str = "0.2.0"
    uptime_seconds: float = 0.0
    active_runs: int = 0
    etcd_connected: bool = False
    dataplane_connected: bool = False


class MetricsSummary(BaseModel):
    """Aggregated metrics snapshot for the control plane."""

    total_runs: int = 0
    active_runs: int = 0
    total_checkpoints: int = 0
    total_checkpoint_bytes: int = 0
    total_workers: int = 0
    active_workers: int = 0
    avg_checkpoint_duration_ms: float = 0.0
    checkpoint_success_rate: float = 0.0
