"""Shared test fixtures for the checkpoint runtime test suite."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SRC_DIR = str(Path(__file__).resolve().parent.parent / "src")
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from controlplane.coordinator import Coordinator
from controlplane.models import RunConfig, ShardingPolicy
from controlplane.state_machine import RunStateMachine


@pytest.fixture()
def fsm() -> RunStateMachine:
    return RunStateMachine()


@pytest.fixture()
def coordinator() -> Coordinator:
    return Coordinator(use_memory=True)


@pytest.fixture()
def sample_config() -> RunConfig:
    return RunConfig(
        name="test-run",
        num_workers=4,
        sharding_policy=ShardingPolicy.RANGE_SHARDING,
        checkpoint_interval_steps=100,
    )
