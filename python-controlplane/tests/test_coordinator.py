"""Placeholder tests for the etcd coordinator.

These tests validate the placeholder coordinator interface. Once a real
etcd backend is wired, they should be expanded with integration tests
against a test etcd cluster.
"""

from __future__ import annotations

import pytest

from controlplane.coordinator import EtcdConfig, EtcdCoordinator


@pytest.fixture
def coordinator() -> EtcdCoordinator:
    """Return a coordinator with default config."""
    return EtcdCoordinator(EtcdConfig())


class TestCoordinatorLifecycle:
    @pytest.mark.asyncio
    async def test_connect_and_close(self, coordinator: EtcdCoordinator) -> None:
        await coordinator.connect()
        await coordinator.close()

    @pytest.mark.asyncio
    async def test_context_manager(self) -> None:
        async with EtcdCoordinator() as coord:
            assert coord is not None


class TestLeaderElection:
    @pytest.mark.asyncio
    async def test_campaign_succeeds(self, coordinator: EtcdCoordinator) -> None:
        await coordinator.connect()
        result = await coordinator.campaign_for_leadership()
        assert result is True
        assert coordinator.is_leader is True
        await coordinator.close()

    @pytest.mark.asyncio
    async def test_resign_leadership(self, coordinator: EtcdCoordinator) -> None:
        await coordinator.connect()
        await coordinator.campaign_for_leadership()
        await coordinator.resign_leadership()
        assert coordinator.is_leader is False
        await coordinator.close()


class TestDistributedLocking:
    @pytest.mark.asyncio
    async def test_acquire_lock(self, coordinator: EtcdCoordinator) -> None:
        await coordinator.connect()
        token = await coordinator.acquire_lock("test-key")
        assert token is not None
        await coordinator.close()

    @pytest.mark.asyncio
    async def test_release_lock(self, coordinator: EtcdCoordinator) -> None:
        await coordinator.connect()
        token = await coordinator.acquire_lock("test-key")
        assert token is not None
        released = await coordinator.release_lock("test-key", token)
        assert released is True
        await coordinator.close()


class TestKeyValue:
    @pytest.mark.asyncio
    async def test_put_and_get(self, coordinator: EtcdCoordinator) -> None:
        await coordinator.connect()
        await coordinator.put("test/key", "test-value")
        # Placeholder always returns None
        value = await coordinator.get("test/key")
        assert value is None  # expected for placeholder
        await coordinator.close()

    @pytest.mark.asyncio
    async def test_delete(self, coordinator: EtcdCoordinator) -> None:
        await coordinator.connect()
        result = await coordinator.delete("test/key")
        assert result is True
        await coordinator.close()
