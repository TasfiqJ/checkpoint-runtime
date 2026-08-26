"""Tests for automatic checkpoint storage retention."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from controlplane.coordinator import Coordinator
from controlplane.models import RunConfig, RunState
from controlplane.retention import CheckpointRetentionManager, RetentionConfig


class FakePaginator:
    def __init__(self, objects: list[dict]) -> None:
        self._objects = objects

    def paginate(self, **_: str):
        yield {"Contents": self._objects}


class FakeS3:
    def __init__(self, objects: list[dict], *, errors: list[dict] | None = None) -> None:
        self.objects = objects
        self.errors = errors or []
        self.deleted: list[str] = []

    def get_paginator(self, name: str) -> FakePaginator:
        assert name == "list_objects_v2"
        return FakePaginator(self.objects)

    def delete_objects(self, *, Bucket: str, Delete: dict) -> dict:  # noqa: N803
        assert Bucket == "checkpoints"
        self.deleted.extend(item["Key"] for item in Delete["Objects"])
        return {"Errors": self.errors}


def object_record(key: str, modified: datetime, size: int = 1) -> dict:
    return {"Key": key, "LastModified": modified, "Size": size}


def test_retention_keeps_latest_commit_and_recent_upload() -> None:
    now = datetime.now(UTC)
    old = now - timedelta(hours=2)
    recent = now - timedelta(minutes=10)
    coordinator = Coordinator(use_memory=True)
    run = coordinator.create_run(RunConfig(name="retention", num_workers=1))
    first = coordinator.create_checkpoint(run.run_id, step=10)
    second = coordinator.create_checkpoint(run.run_id, step=20)
    coordinator.update_checkpoint_state(first.checkpoint_id, "COMMITTED")
    coordinator.update_checkpoint_state(second.checkpoint_id, "COMMITTED")

    old_orphan = "old-orphan"
    recent_orphan = "recent-orphan"
    objects = [
        object_record(f"{run.run_id}/{first.checkpoint_id}/rank-0.bin", old, 10),
        object_record(f"{run.run_id}/{first.checkpoint_id}/_manifest.json", old, 2),
        object_record(f"{run.run_id}/{second.checkpoint_id}/rank-0.bin", recent, 20),
        object_record(f"{run.run_id}/{second.checkpoint_id}/_manifest.json", recent, 2),
        object_record(f"{run.run_id}/{old_orphan}/rank-0.bin", old, 5),
        object_record(f"{run.run_id}/{recent_orphan}/rank-0.bin", recent, 7),
    ]
    s3 = FakeS3(objects)
    manager = CheckpointRetentionManager(
        coordinator,
        RetentionConfig(keep_committed_per_run=1, orphan_grace_seconds=3600),
        s3_client=s3,
    )

    result = manager.run_once(now=now)

    assert result.checkpoints_deleted == 2
    assert result.objects_deleted == 3
    assert result.bytes_freed == 17
    assert set(s3.deleted) == {
        f"{run.run_id}/{first.checkpoint_id}/rank-0.bin",
        f"{run.run_id}/{first.checkpoint_id}/_manifest.json",
        f"{run.run_id}/{old_orphan}/rank-0.bin",
    }
    assert coordinator.get_checkpoint(first.checkpoint_id) is None
    assert coordinator.get_checkpoint(second.checkpoint_id) is not None


def test_retention_does_not_prune_metadata_when_s3_delete_fails() -> None:
    now = datetime.now(UTC)
    coordinator = Coordinator(use_memory=True)
    run = coordinator.create_run(RunConfig(name="retention", num_workers=1))
    checkpoint = coordinator.create_checkpoint(run.run_id, step=10)
    objects = [
        object_record(
            f"{run.run_id}/{checkpoint.checkpoint_id}/rank-0.bin",
            now - timedelta(hours=2),
        ),
    ]
    s3 = FakeS3(objects, errors=[{"Key": objects[0]["Key"], "Code": "InternalError"}])
    manager = CheckpointRetentionManager(
        coordinator,
        RetentionConfig(orphan_grace_seconds=0),
        s3_client=s3,
    )

    with pytest.raises(RuntimeError, match="S3 retention delete failed"):
        manager.run_once(now=now)

    assert coordinator.get_checkpoint(checkpoint.checkpoint_id) is not None


def test_retention_removes_entire_old_run_prefixes() -> None:
    now = datetime.now(UTC)
    coordinator = Coordinator(use_memory=True)
    objects = [
        object_record("old-run/checkpoint-a/rank-0.bin", now - timedelta(days=2), 10),
        object_record("old-run/checkpoint-a/_manifest.json", now - timedelta(days=2), 2),
        object_record("new-run/checkpoint-b/rank-0.bin", now, 20),
        object_record("new-run/checkpoint-b/_manifest.json", now, 2),
    ]
    s3 = FakeS3(objects)
    manager = CheckpointRetentionManager(
        coordinator,
        RetentionConfig(keep_committed_per_run=30, keep_runs=1),
        s3_client=s3,
    )

    result = manager.run_once(now=now)

    assert result.checkpoints_deleted == 1
    assert result.objects_deleted == 2
    assert result.bytes_freed == 12
    assert set(s3.deleted) == {
        "old-run/checkpoint-a/rank-0.bin",
        "old-run/checkpoint-a/_manifest.json",
    }


def test_retention_preserves_only_newest_failed_recovery_run() -> None:
    now = datetime.now(UTC)
    coordinator = Coordinator(use_memory=True)
    older_failed = coordinator.create_run(RunConfig(name="older-failed", num_workers=1))
    coordinator.transition_run(older_failed.run_id, RunState.RUNNING)
    coordinator.transition_run(older_failed.run_id, RunState.FAILED)
    newest_failed = coordinator.create_run(RunConfig(name="newest-failed", num_workers=1))
    coordinator.transition_run(newest_failed.run_id, RunState.RUNNING)
    coordinator.transition_run(newest_failed.run_id, RunState.FAILED)
    older_status = coordinator.get_run(older_failed.run_id)
    newest_status = coordinator.get_run(newest_failed.run_id)
    assert older_status is not None
    assert newest_status is not None
    older_status.updated_at = now - timedelta(minutes=1)
    newest_status.updated_at = now
    coordinator._persist_run(older_status)
    coordinator._persist_run(newest_status)

    objects = [
        object_record(
            f"{older_failed.run_id}/checkpoint-old/_manifest.json",
            now - timedelta(days=3),
        ),
        object_record(
            f"{newest_failed.run_id}/checkpoint-recovery/_manifest.json",
            now - timedelta(days=2),
        ),
        object_record("recent-run/checkpoint-new/_manifest.json", now),
    ]
    s3 = FakeS3(objects)
    manager = CheckpointRetentionManager(
        coordinator,
        RetentionConfig(keep_runs=1),
        s3_client=s3,
    )

    manager.run_once(now=now)

    assert s3.deleted == [
        f"{older_failed.run_id}/checkpoint-old/_manifest.json",
    ]


def test_retention_preserves_all_newest_failed_timestamp_ties() -> None:
    now = datetime.now(UTC)
    coordinator = Coordinator(use_memory=True)
    failed_runs = []
    for name in ("older", "tied-a", "tied-b"):
        run = coordinator.create_run(RunConfig(name=name, num_workers=1))
        coordinator.transition_run(run.run_id, RunState.RUNNING)
        coordinator.transition_run(run.run_id, RunState.FAILED)
        failed_runs.append(run)

    for run, updated_at in zip(
        failed_runs,
        (now - timedelta(minutes=1), now, now),
        strict=True,
    ):
        status = coordinator.get_run(run.run_id)
        assert status is not None
        status.updated_at = updated_at
        coordinator._persist_run(status)

    objects = [
        object_record(
            f"{run.run_id}/checkpoint-{index}/_manifest.json",
            now - timedelta(days=3 - index),
        )
        for index, run in enumerate(failed_runs)
    ]
    objects.append(object_record("recent-run/checkpoint-new/_manifest.json", now))
    s3 = FakeS3(objects)
    manager = CheckpointRetentionManager(
        coordinator,
        RetentionConfig(keep_runs=1),
        s3_client=s3,
    )

    manager.run_once(now=now)

    assert s3.deleted == [
        f"{failed_runs[0].run_id}/checkpoint-0/_manifest.json",
    ]
