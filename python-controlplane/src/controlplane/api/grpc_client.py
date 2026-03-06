"""gRPC client for communicating with the Rust data plane.

Provides a typed async interface over the ``CheckpointService`` defined in
``proto/checkpoint.proto``.  The client handles connection management,
streaming uploads/downloads, and health checks.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass

import grpc  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ShardChunk:
    shard_id: str
    checkpoint_id: str
    offset: int
    data: bytes
    is_last: bool = False


@dataclass(frozen=True, slots=True)
class WriteShardResult:
    shard_id: str
    total_bytes: int
    sha256_checksum: str
    success: bool
    error_message: str = ""


@dataclass(frozen=True, slots=True)
class ShardInfo:
    shard_id: str
    rank: int
    size_bytes: int
    sha256: str
    storage_key: str


@dataclass(frozen=True, slots=True)
class CommitResult:
    success: bool
    manifest_key: str = ""
    error_message: str = ""


@dataclass(frozen=True, slots=True)
class AbortResult:
    success: bool
    shards_deleted: int = 0
    error_message: str = ""


@dataclass(frozen=True, slots=True)
class DataPlaneHealth:
    healthy: bool
    queue_depth: int = 0
    memory_used_bytes: int = 0
    active_uploads: int = 0


class DataPlaneClient:
    """Async gRPC client to the Rust data plane CheckpointService."""

    def __init__(self, address: str = "localhost:50051") -> None:
        self._address = address
        self._channel: grpc.aio.Channel | None = None
        self._stub: object | None = None
        self._connected = False

    async def connect(self) -> None:
        try:
            self._channel = grpc.aio.insecure_channel(self._address)
            from controlplane.generated import checkpoint_pb2_grpc
            self._stub = checkpoint_pb2_grpc.CheckpointServiceStub(self._channel)
            self._connected = True
            logger.info("Connected to data plane at %s", self._address)
        except Exception as exc:
            self._connected = False
            logger.error("Failed to connect to data plane at %s: %s", self._address, exc)
            raise

    async def close(self) -> None:
        if self._channel is not None:
            await self._channel.close()
            self._channel = None
            self._stub = None
            self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected

    async def write_shard(self, chunks: AsyncIterator[ShardChunk]) -> WriteShardResult:
        self._ensure_stub()
        from controlplane.generated import checkpoint_pb2

        async def _request_iterator() -> AsyncIterator[object]:
            async for chunk in chunks:
                yield checkpoint_pb2.ShardChunk(
                    shard_id=chunk.shard_id,
                    checkpoint_id=chunk.checkpoint_id,
                    offset=chunk.offset,
                    data=chunk.data,
                    is_last=chunk.is_last,
                )

        response = await self._stub.WriteShard(_request_iterator())
        result = WriteShardResult(
            shard_id=response.shard_id,
            total_bytes=response.total_bytes,
            sha256_checksum=response.sha256_checksum,
            success=response.success,
            error_message=getattr(response, "error_message", ""),
        )
        if not result.success:
            raise RuntimeError(f"WriteShard failed: {result.error_message}")
        return result

    async def read_shard(
        self, shard_id: str, checkpoint_id: str, run_id: str,
    ) -> AsyncIterator[ShardChunk]:
        self._ensure_stub()
        from controlplane.generated import checkpoint_pb2

        request = checkpoint_pb2.ReadShardRequest(
            shard_id=shard_id, checkpoint_id=checkpoint_id, run_id=run_id,
        )

        async for chunk in self._stub.ReadShard(request):
            yield ShardChunk(
                shard_id=chunk.shard_id,
                checkpoint_id=chunk.checkpoint_id,
                offset=chunk.offset,
                data=chunk.data,
                is_last=chunk.is_last,
            )

    async def commit_checkpoint(
        self, checkpoint_id: str, run_id: str, step: int,
        shards: Sequence[ShardInfo], metadata: dict[str, str] | None = None,
    ) -> CommitResult:
        self._ensure_stub()
        from controlplane.generated import checkpoint_pb2, common_pb2

        proto_shards = [
            common_pb2.ShardInfo(
                shard_id=s.shard_id, rank=s.rank, size_bytes=s.size_bytes,
                sha256=s.sha256, storage_key=s.storage_key,
            )
            for s in shards
        ]

        request = checkpoint_pb2.CommitRequest(
            checkpoint_id=checkpoint_id, run_id=run_id,
            step=step, shards=proto_shards, metadata=metadata or {},
        )

        response = await self._stub.CommitCheckpoint(request)
        return CommitResult(
            success=response.success,
            manifest_key=response.manifest_key,
            error_message=response.error_message,
        )

    async def abort_checkpoint(self, checkpoint_id: str, run_id: str) -> AbortResult:
        self._ensure_stub()
        from controlplane.generated import checkpoint_pb2

        request = checkpoint_pb2.AbortRequest(
            checkpoint_id=checkpoint_id, run_id=run_id,
        )

        response = await self._stub.AbortCheckpoint(request)
        return AbortResult(
            success=response.success,
            shards_deleted=response.shards_deleted,
            error_message=getattr(response, "error_message", ""),
        )

    async def health_check(self) -> DataPlaneHealth:
        self._ensure_stub()
        from controlplane.generated import checkpoint_pb2

        request = checkpoint_pb2.HealthRequest()
        response = await self._stub.HealthCheck(request)

        return DataPlaneHealth(
            healthy=response.serving,
            queue_depth=response.queue_depth,
            memory_used_bytes=response.memory_used_bytes,
            active_uploads=response.active_uploads,
        )

    def _ensure_stub(self) -> None:
        if self._stub is None:
            raise ConnectionError(
                "Not connected to data plane. Call connect() first."
            )
