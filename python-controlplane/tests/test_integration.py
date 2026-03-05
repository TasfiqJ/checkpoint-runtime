"""Placeholder integration tests for the checkpoint runtime control plane.

These tests are intended to exercise the full stack:
  SDK client -> REST API -> coordinator -> gRPC workers

They require a running control plane and (optionally) worker instances.
For now they serve as a skeleton for future CI integration.
"""

from __future__ import annotations

import pytest


@pytest.fixture
def controlplane_url() -> str:
    """Base URL for the control plane under test."""
    return "http://localhost:8000"


class TestRunLifecycleIntegration:
    """End-to-end run lifecycle via the REST API."""

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires a running control plane instance")
    async def test_create_and_cancel_run(self, controlplane_url: str) -> None:
        """Create a run, verify its status, then cancel it."""
        # TODO: Use httpx or RuntimeClient to drive the API
        pass

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires a running control plane instance")
    async def test_checkpoint_and_resume(self, controlplane_url: str) -> None:
        """Start a run, trigger a checkpoint, then resume."""
        pass

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires a running control plane instance")
    async def test_failure_recovery_flow(self, controlplane_url: str) -> None:
        """Simulate a failure and verify recovery path."""
        pass


class TestSDKClientIntegration:
    """Integration tests exercising the SDK client against a live API."""

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires a running control plane instance")
    async def test_register_dataset_and_start_run(
        self, controlplane_url: str
    ) -> None:
        """Register a dataset via the SDK, then start a run."""
        pass

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires a running control plane instance")
    async def test_list_checkpoints_empty(self, controlplane_url: str) -> None:
        """Verify an empty checkpoint list for a fresh run."""
        pass


class TestHealthAndMetrics:
    """Basic smoke tests for operational endpoints."""

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires a running control plane instance")
    async def test_health_endpoint(self, controlplane_url: str) -> None:
        """GET /api/health returns 200 with status=ok."""
        pass

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires a running control plane instance")
    async def test_metrics_summary(self, controlplane_url: str) -> None:
        """GET /api/metrics/summary returns valid metrics."""
        pass
