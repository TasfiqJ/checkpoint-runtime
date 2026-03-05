"""Shared type aliases and enumerations for the SDK."""

from __future__ import annotations

from enum import StrEnum
from typing import NewType

# ---------------------------------------------------------------------------
# Domain-specific ID types
# ---------------------------------------------------------------------------
DatasetId = NewType("DatasetId", str)
RunId = NewType("RunId", str)
CheckpointId = NewType("CheckpointId", str)


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------
class ShardingPolicy(StrEnum):
    """Strategy for distributing dataset shards across workers."""

    HASH = "hash"
    RANGE = "range"
    ROUND_ROBIN = "round_robin"
    CUSTOM = "custom"
