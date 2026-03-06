"""User-facing SDK client for the checkpoint runtime control plane.

The ``RuntimeClient`` communicates with the control plane over its REST API.

Usage::

    from sdk.client import RuntimeClient

    client = RuntimeClient("http://localhost:8000")
    run = client.start_run(name="gpt-finetune", num_workers=8)
    cp = client.checkpoint(run["run_id"], step=500)
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class SDKError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        self.status_code = status_code
        super().__init__(message)


class RunNotFoundError(SDKError):
    pass


class StateTransitionError(SDKError):
    pass


class RuntimeClient:
    """Synchronous SDK client for the checkpoint runtime control plane."""

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            timeout=timeout,
            headers=headers or {},
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> RuntimeClient:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    # -- runs ---------------------------------------------------------------

    def start_run(
        self,
        name: str,
        num_workers: int = 1,
        **kwargs: Any,
    ) -> dict[str, Any]:
        config = {"name": name, "num_workers": num_workers, **kwargs}
        resp = self._post("/api/runs", json=config)
        run_id = resp["run_id"]
        resp = self._post(f"/api/runs/{run_id}/start")
        return resp

    def create_run(self, config: dict[str, Any]) -> dict[str, Any]:
        return self._post("/api/runs", json=config)

    def get_run_status(self, run_id: str) -> dict[str, Any]:
        return self._get(f"/api/runs/{run_id}")

    def list_runs(self) -> list[dict[str, Any]]:
        return self._get("/api/runs")

    def cancel_run(self, run_id: str) -> dict[str, Any]:
        return self._post(f"/api/runs/{run_id}/cancel")

    def complete_run(self, run_id: str) -> dict[str, Any]:
        return self._post(f"/api/runs/{run_id}/complete")

    # -- checkpoints --------------------------------------------------------

    def checkpoint(self, run_id: str, step: int | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if step is not None:
            params["step"] = step
        return self._post(f"/api/runs/{run_id}/checkpoint", params=params)

    def commit_checkpoint(self, run_id: str) -> dict[str, Any]:
        return self._post(f"/api/runs/{run_id}/commit")

    def list_checkpoints(self, run_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/runs/{run_id}/checkpoints")

    def get_checkpoint(self, checkpoint_id: str) -> dict[str, Any]:
        return self._get(f"/api/checkpoints/{checkpoint_id}")

    # -- resume -------------------------------------------------------------

    def resume(self, run_id: str) -> dict[str, Any]:
        return self._post(f"/api/runs/{run_id}/resume")

    # -- datasets -----------------------------------------------------------

    def register_dataset(
        self,
        dataset_id: str,
        uri: str,
        *,
        sharding_policy: str = "RANGE_SHARDING",
        metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        payload = {
            "dataset_id": dataset_id,
            "uri": uri,
            "sharding_policy": sharding_policy,
            "metadata": metadata or {},
        }
        try:
            return self._post("/api/datasets", json=payload)
        except SDKError:
            logger.warning("Dataset registration endpoint unavailable")
            return payload

    # -- workers ------------------------------------------------------------

    def register_worker(
        self,
        run_id: str | None = None,
        hostname: str = "",
    ) -> dict[str, Any]:
        return self._post("/api/workers/register", json={
            "run_id": run_id,
            "hostname": hostname,
        })

    def heartbeat(self, worker_id: str, step: int = 0) -> dict[str, Any]:
        return self._post(f"/api/workers/{worker_id}/heartbeat", json={"step": step})

    # -- shard data transfer ------------------------------------------------

    def save_shard(
        self,
        run_id: str,
        checkpoint_id: str,
        shard_id: str,
        data: bytes,
        rank: int = 0,
    ) -> dict[str, Any]:
        """Upload shard bytes to the data plane via the control plane."""
        response = self._client.post(
            f"/api/runs/{run_id}/checkpoints/{checkpoint_id}/shards/{shard_id}",
            content=data,
            headers={
                "Content-Type": "application/octet-stream",
                "X-Shard-Rank": str(rank),
            },
            timeout=120.0,
        )
        return self._handle_response(response)

    def load_shard(
        self,
        run_id: str,
        checkpoint_id: str,
        shard_id: str,
    ) -> bytes:
        """Download shard bytes from the data plane via the control plane."""
        response = self._client.get(
            f"/api/runs/{run_id}/checkpoints/{checkpoint_id}/shards/{shard_id}",
            timeout=120.0,
        )
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail", response.text)
            except Exception:
                detail = response.text
            if response.status_code == 404:
                raise RunNotFoundError(detail, status_code=404)
            raise SDKError(
                f"HTTP {response.status_code}: {detail}",
                status_code=response.status_code,
            )
        return response.content

    # -- health & metrics ---------------------------------------------------

    def health(self) -> dict[str, Any]:
        return self._get("/api/health")

    def metrics_summary(self) -> dict[str, Any]:
        return self._get("/api/metrics/summary")

    # -- HTTP helpers -------------------------------------------------------

    def _get(self, path: str, **kwargs: Any) -> Any:
        response = self._client.get(path, **kwargs)
        return self._handle_response(response)

    def _post(self, path: str, **kwargs: Any) -> Any:
        response = self._client.post(path, **kwargs)
        return self._handle_response(response)

    @staticmethod
    def _handle_response(response: httpx.Response) -> Any:
        if response.status_code >= 400:
            # Safely extract detail from JSON body, fall back to raw text
            try:
                body = response.json()
                detail = body.get("detail", response.text)
            except Exception:
                detail = response.text

            if response.status_code == 404:
                raise RunNotFoundError(detail, status_code=404)
            if response.status_code == 409:
                raise StateTransitionError(detail, status_code=409)
            raise SDKError(
                f"HTTP {response.status_code}: {detail}",
                status_code=response.status_code,
            )
        return response.json()
