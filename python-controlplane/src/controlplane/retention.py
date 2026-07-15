"""Automatic checkpoint retention for S3-compatible storage.

The manifest is the checkpoint commit signal.  Retention therefore keeps the
newest committed checkpoints per run and removes manifest-less uploads only
after a grace period, so it never races a checkpoint that is still being
written.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from controlplane.coordinator import Coordinator

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RetentionConfig:
    enabled: bool = True
    keep_committed_per_run: int = 30
    orphan_grace_seconds: int = 3600
    interval_seconds: int = 3600
    endpoint: str = "http://minio:9000"
    bucket: str = "checkpoints"
    access_key: str = "minioadmin"
    secret_key: str = "minioadmin"
    region: str = "us-east-1"

    @classmethod
    def from_env(cls) -> RetentionConfig:
        enabled = os.environ.get("CHECKPOINT_RETENTION_ENABLED", "true").lower()
        return cls(
            enabled=enabled not in {"0", "false", "no", "off"},
            keep_committed_per_run=max(
                1, int(os.environ.get("CHECKPOINT_RETENTION_COUNT", "30")),
            ),
            orphan_grace_seconds=max(
                0, int(os.environ.get("CHECKPOINT_ORPHAN_GRACE_SECONDS", "3600")),
            ),
            interval_seconds=max(
                60, int(os.environ.get("CHECKPOINT_RETENTION_INTERVAL_SECONDS", "3600")),
            ),
            endpoint=os.environ.get("S3_ENDPOINT", "http://minio:9000"),
            bucket=os.environ.get("S3_BUCKET", "checkpoints"),
            access_key=os.environ.get(
                "S3_ACCESS_KEY", os.environ.get("AWS_ACCESS_KEY_ID", "minioadmin"),
            ),
            secret_key=os.environ.get(
                "S3_SECRET_KEY", os.environ.get("AWS_SECRET_ACCESS_KEY", "minioadmin"),
            ),
            region=os.environ.get("S3_REGION", "us-east-1"),
        )


@dataclass(frozen=True, slots=True)
class RetentionResult:
    checkpoints_deleted: int = 0
    objects_deleted: int = 0
    bytes_freed: int = 0


class CheckpointRetentionManager:
    def __init__(
        self,
        coordinator: Coordinator,
        config: RetentionConfig,
        *,
        s3_client: Any | None = None,
    ) -> None:
        self._coordinator = coordinator
        self._config = config
        self._s3 = s3_client
        self._task: asyncio.Task[None] | None = None

    def _get_s3_client(self) -> Any:
        if self._s3 is None:
            import boto3
            from botocore.config import Config as BotoConfig

            self._s3 = boto3.client(
                "s3",
                endpoint_url=self._config.endpoint,
                aws_access_key_id=self._config.access_key,
                aws_secret_access_key=self._config.secret_key,
                config=BotoConfig(signature_version="s3v4"),
                region_name=self._config.region,
            )
        return self._s3

    async def start(self) -> None:
        if not self._config.enabled or self._task is not None:
            return
        self._task = asyncio.create_task(self._run_loop(), name="checkpoint-retention")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    async def _run_loop(self) -> None:
        while True:
            try:
                result = await asyncio.to_thread(self.run_once)
                logger.info(
                    "Checkpoint retention completed: checkpoints=%d objects=%d bytes=%d",
                    result.checkpoints_deleted,
                    result.objects_deleted,
                    result.bytes_freed,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Checkpoint retention pass failed")
            await asyncio.sleep(self._config.interval_seconds)

    def run_once(self, *, now: datetime | None = None) -> RetentionResult:
        """Run one retention pass and return exact deletion counts."""
        s3 = self._get_s3_client()
        objects: list[dict[str, Any]] = []
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._config.bucket):
            objects.extend(page.get("Contents", []))

        grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for item in objects:
            parts = item["Key"].split("/", 2)
            if len(parts) == 3:
                grouped[(parts[0], parts[1])].append(item)

        by_run: dict[str, list[tuple[str, list[dict[str, Any]]]]] = defaultdict(list)
        for (run_id, checkpoint_id), checkpoint_objects in grouped.items():
            by_run[run_id].append((checkpoint_id, checkpoint_objects))

        cutoff = (now or datetime.now(UTC)) - timedelta(
            seconds=self._config.orphan_grace_seconds,
        )
        to_delete: list[tuple[str, str, list[dict[str, Any]]]] = []

        for run_id, checkpoints in by_run.items():
            committed = []
            orphans = []
            for checkpoint_id, checkpoint_objects in checkpoints:
                record = (checkpoint_id, checkpoint_objects)
                if any(obj["Key"].endswith("/_manifest.json") for obj in checkpoint_objects):
                    committed.append(record)
                else:
                    orphans.append(record)

            committed.sort(
                key=lambda record: max(obj["LastModified"] for obj in record[1]),
                reverse=True,
            )
            for checkpoint_id, checkpoint_objects in committed[
                self._config.keep_committed_per_run:
            ]:
                to_delete.append((run_id, checkpoint_id, checkpoint_objects))

            for checkpoint_id, checkpoint_objects in orphans:
                latest = max(obj["LastModified"] for obj in checkpoint_objects)
                if latest < cutoff:
                    to_delete.append((run_id, checkpoint_id, checkpoint_objects))

        delete_items = [obj for _, _, checkpoint_objects in to_delete for obj in checkpoint_objects]
        for offset in range(0, len(delete_items), 1000):
            batch = delete_items[offset : offset + 1000]
            response = s3.delete_objects(
                Bucket=self._config.bucket,
                Delete={"Objects": [{"Key": obj["Key"]} for obj in batch], "Quiet": True},
            )
            errors = response.get("Errors", [])
            if errors:
                raise RuntimeError(f"S3 retention delete failed: {errors[0]}")

        for run_id, checkpoint_id, _ in to_delete:
            checkpoint = self._coordinator.get_checkpoint(checkpoint_id)
            if checkpoint is not None and checkpoint.run_id == run_id:
                self._coordinator.delete_checkpoint(checkpoint_id)

        return RetentionResult(
            checkpoints_deleted=len(to_delete),
            objects_deleted=len(delete_items),
            bytes_freed=sum(int(obj.get("Size", 0)) for obj in delete_items),
        )
