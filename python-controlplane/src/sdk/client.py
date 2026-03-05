"""High-level SDK client for the checkpoint runtime control plane.

Provides a user-friendly interface for registering datasets, managing runs,
and performing checkpoint/restore operations via the REST API.
"""

from __future__ import annotations

import logging
from typing import Any

from sdk.types import CheckpointId, DatasetId, RunId, ShardingPolicy

logger = logging.getLogger(__name__)


class RuntimeClient:
    """Client for interacting with the checkpoint runtime control plane.

    Usage::

        async with RuntimeClient("http://localhost:8000") as client:
            ds = await client.register_dataset("my-dataset", shard_count=8)
            run_id = await client.start_run(ds)
            status = await client.get_run_status(run_id)

    Parameters
    ----------
    base_url:
        Base URL of the control plane REST API.
    timeout:
        HTTP request timeout in seconds.
    api_key:
        Optional API key for authenticated endpoints.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        timeout: float = 30.0,
        api_key: str | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._api_key = api_key
        self._http_client: Any = None  # httpx.AsyncClient placeholder

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> None:
        """Initialise the underlying HTTP client.

        TODO: Create a real ``httpx.AsyncClient`` with auth headers.
        """
        logger.info("Connecting RuntimeClient to %s", self._base_url)
        # Placeholder: self._http_client = httpx.AsyncClient(...)

    async def close(self) -> None:
        """Close the HTTP client and release resources."""
        if self._http_client is not None:
            # await self._http_client.aclose()
            pass
        logger.info("RuntimeClient closed")

    async def __aenter__(self) -> RuntimeClient:
        await self.connect()
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.close()

    # -- datasets -------------------------------------------------------------

    async def register_dataset(
        self,
        name: str,
        shard_count: int = 1,
        total_size_bytes: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> DatasetId:
        """Register a new dataset with the control plane.

        Returns the assigned ``DatasetId``.
        """
        logger.info("Registering dataset %r (shards=%d)", name, shard_count)
        # Placeholder: POST /api/datasets
        # response = await self._http_client.post(...)
        return DatasetId(f"ds-{name}")

    # -- runs -----------------------------------------------------------------

    async def start_run(
        self,
        dataset_id: DatasetId,
        sharding_policy: ShardingPolicy = ShardingPolicy.HASH,
        num_workers: int = 1,
        checkpoint_interval_seconds: int = 300,
        max_retries: int = 3,
        metadata: dict[str, Any] | None = None,
    ) -> RunId:
        """Create and start a new run.

        Returns the assigned ``RunId``.
        """
        logger.info(
            "Starting run: dataset=%s workers=%d policy=%s",
            dataset_id, num_workers, sharding_policy.value,
        )
        # Placeholder: POST /api/runs
        return RunId("run-placeholder-id")

    async def checkpoint(self, run_id: RunId) -> CheckpointId:
        """Trigger an ad-hoc checkpoint for the given run.

        Returns the ``CheckpointId`` of the new checkpoint.
        """
        logger.info("Triggering checkpoint for run %s", run_id)
        # Placeholder: POST /api/runs/{run_id}/checkpoint
        return CheckpointId("ckpt-placeholder-id")

    async def resume(self, run_id: RunId) -> None:
        """Resume a run from its most recent checkpoint."""
        logger.info("Resuming run %s", run_id)
        # Placeholder: POST /api/runs/{run_id}/resume

    async def get_run_status(self, run_id: RunId) -> dict[str, Any]:
        """Fetch the current status of a run.

        Returns the raw status dictionary from the API.
        """
        logger.info("Fetching status for run %s", run_id)
        # Placeholder: GET /api/runs/{run_id}
        return {
            "run_id": str(run_id),
            "state": "CREATED",
            "checkpoint_count": 0,
        }

    async def list_checkpoints(self, run_id: RunId) -> list[dict[str, Any]]:
        """List all checkpoints for a run.

        Returns a list of checkpoint info dictionaries.
        """
        logger.info("Listing checkpoints for run %s", run_id)
        # Placeholder: GET /api/runs/{run_id}/checkpoints
        return []

    async def cancel_run(self, run_id: RunId) -> None:
        """Request cancellation of a running run."""
        logger.info("Cancelling run %s", run_id)
        # Placeholder: POST /api/runs/{run_id}/cancel
