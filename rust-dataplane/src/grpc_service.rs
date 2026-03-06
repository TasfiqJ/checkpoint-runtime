use std::sync::Arc;

use bytes::Bytes;
use futures::StreamExt;
use tonic::{Request, Response, Status, Streaming};
use tracing::{error, info, instrument};

use crate::backpressure::BackpressureController;
use crate::checkpoint::gc::GarbageCollector;
use crate::checkpoint::manifest::{Manifest, ManifestManager, ManifestShard};
use crate::checkpoint::reader::ShardReader;
use crate::checkpoint::writer::ShardWriter;
use crate::config::Config;
use crate::metrics;
use crate::retry::RetryPolicy;
use crate::storage::checksum::StreamingChecksum;
use crate::storage::s3::S3Client;

pub mod common {
    tonic::include_proto!("ckpt_rt.common");
}

pub mod proto {
    tonic::include_proto!("ckpt_rt.checkpoint");
}

pub struct CheckpointServiceImpl {
    writer: Arc<ShardWriter>,
    reader: Arc<ShardReader>,
    manifest_mgr: Arc<ManifestManager>,
    gc: Arc<GarbageCollector>,
    backpressure: Arc<BackpressureController>,
    bucket: String,
}

#[tonic::async_trait]
impl proto::checkpoint_service_server::CheckpointService for CheckpointServiceImpl {
    #[instrument(skip(self, request))]
    async fn write_shard(
        &self,
        request: Request<Streaming<proto::ShardChunk>>,
    ) -> Result<Response<proto::WriteShardResponse>, Status> {
        // Check backpressure before accepting work
        if self.backpressure.depth() >= self.backpressure.max_depth() {
            metrics::GRPC_REQUESTS_TOTAL
                .with_label_values(&["write_shard", "ERROR"])
                .inc();
            return Err(Status::resource_exhausted(
                "Backpressure queue full — try again later",
            ));
        }

        let start = std::time::Instant::now();
        let mut stream = request.into_inner();
        let mut chunks: Vec<Bytes> = Vec::new();
        let mut shard_id = String::new();
        let mut checkpoint_id = String::new();
        let mut hasher = StreamingChecksum::new();

        self.backpressure.increment();
        metrics::BACKPRESSURE_QUEUE_DEPTH.set(self.backpressure.depth() as i64);

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| {
                self.backpressure.decrement();
                metrics::BACKPRESSURE_QUEUE_DEPTH.set(self.backpressure.depth() as i64);
                metrics::SHARD_WRITES_TOTAL.with_label_values(&["error"]).inc();
                metrics::GRPC_REQUESTS_TOTAL.with_label_values(&["write_shard", "ERROR"]).inc();
                Status::internal(format!("Stream error: {}", e))
            })?;

            if shard_id.is_empty() {
                shard_id = chunk.shard_id.clone();
                checkpoint_id = chunk.checkpoint_id.clone();
            }

            hasher.update(&chunk.data);
            chunks.push(Bytes::from(chunk.data));
        }

        let (_checksum, _total_bytes) = hasher.finalize();

        // ShardChunk doesn't carry run_id, so the Python control plane
        // encodes it as "run_id/checkpoint_id" in the checkpoint_id field.
        let (run_id, real_checkpoint_id) = if let Some(pos) = checkpoint_id.find('/') {
            (
                checkpoint_id[..pos].to_string(),
                checkpoint_id[pos + 1..].to_string(),
            )
        } else {
            // Fallback: use checkpoint_id as run_id (legacy behavior)
            (checkpoint_id.clone(), checkpoint_id.clone())
        };

        // Write shard with retry for transient S3 failures
        let writer = self.writer.clone();
        let run_id_clone = run_id.clone();
        let checkpoint_id_clone = real_checkpoint_id.clone();
        let shard_id_clone = shard_id.clone();
        let retry = RetryPolicy::new(3, 500);
        let result = retry
            .execute(|| {
                let w = writer.clone();
                let rid = run_id_clone.clone();
                let cid = checkpoint_id_clone.clone();
                let sid = shard_id_clone.clone();
                let c = chunks.clone();
                async move { w.write_shard(&rid, &cid, &sid, c).await }
            })
            .await;

        match result {
            Ok(result) => {
                self.backpressure.decrement();
                metrics::BACKPRESSURE_QUEUE_DEPTH.set(self.backpressure.depth() as i64);
                metrics::SHARD_WRITES_TOTAL.with_label_values(&["success"]).inc();
                metrics::SHARD_WRITE_BYTES_TOTAL
                    .with_label_values(&[&run_id])
                    .inc_by(result.total_bytes as f64);
                metrics::SHARD_WRITE_DURATION_SECONDS
                    .with_label_values(&["success"])
                    .observe(start.elapsed().as_secs_f64());
                metrics::GRPC_REQUESTS_TOTAL
                    .with_label_values(&["write_shard", "OK"])
                    .inc();

                Ok(Response::new(proto::WriteShardResponse {
                    shard_id: result.shard_id,
                    total_bytes: result.total_bytes,
                    sha256_checksum: result.sha256_checksum,
                    success: true,
                }))
            }
            Err(e) => {
                self.backpressure.decrement();
                metrics::BACKPRESSURE_QUEUE_DEPTH.set(self.backpressure.depth() as i64);
                metrics::SHARD_WRITES_TOTAL.with_label_values(&["error"]).inc();
                metrics::SHARD_WRITE_DURATION_SECONDS
                    .with_label_values(&["error"])
                    .observe(start.elapsed().as_secs_f64());
                metrics::GRPC_REQUESTS_TOTAL
                    .with_label_values(&["write_shard", "ERROR"])
                    .inc();
                error!(error = %e, "Failed to write shard");
                Err(Status::internal(format!("Write failed: {}", e)))
            }
        }
    }

    type ReadShardStream =
        std::pin::Pin<Box<dyn futures::Stream<Item = Result<proto::ShardChunk, Status>> + Send>>;

    #[instrument(skip(self, request))]
    async fn read_shard(
        &self,
        request: Request<proto::ReadShardRequest>,
    ) -> Result<Response<Self::ReadShardStream>, Status> {
        let start = std::time::Instant::now();
        let req = request.into_inner();
        let reader = self.reader.clone();
        let manifest_mgr = self.manifest_mgr.clone();

        // Look up storage_key from the manifest
        let manifest = manifest_mgr
            .read_manifest(&req.run_id, &req.checkpoint_id)
            .await
            .map_err(|e| {
                metrics::GRPC_REQUESTS_TOTAL
                    .with_label_values(&["read_shard", "ERROR"])
                    .inc();
                Status::internal(format!("Failed to read manifest: {}", e))
            })?
            .ok_or_else(|| {
                metrics::GRPC_REQUESTS_TOTAL
                    .with_label_values(&["read_shard", "ERROR"])
                    .inc();
                Status::not_found(format!(
                    "Manifest not found for run={} checkpoint={}",
                    req.run_id, req.checkpoint_id
                ))
            })?;

        let shard_meta = manifest
            .shards
            .iter()
            .find(|s| s.shard_id == req.shard_id)
            .ok_or_else(|| {
                metrics::GRPC_REQUESTS_TOTAL
                    .with_label_values(&["read_shard", "ERROR"])
                    .inc();
                Status::not_found(format!("Shard {} not found in manifest", req.shard_id))
            })?;

        let storage_key = shard_meta.storage_key.clone();

        let chunks = reader
            .read_shard(&storage_key, 4 * 1024 * 1024)
            .await
            .map_err(|e| {
                metrics::SHARD_READS_TOTAL.with_label_values(&["error"]).inc();
                metrics::SHARD_READ_DURATION_SECONDS
                    .with_label_values(&["error"])
                    .observe(start.elapsed().as_secs_f64());
                metrics::GRPC_REQUESTS_TOTAL
                    .with_label_values(&["read_shard", "ERROR"])
                    .inc();
                Status::internal(format!("Read failed: {}", e))
            })?;

        metrics::SHARD_READS_TOTAL.with_label_values(&["success"]).inc();
        metrics::SHARD_READ_DURATION_SECONDS
            .with_label_values(&["success"])
            .observe(start.elapsed().as_secs_f64());
        metrics::GRPC_REQUESTS_TOTAL
            .with_label_values(&["read_shard", "OK"])
            .inc();

        let total_chunks = chunks.len();
        let shard_id = req.shard_id.clone();
        let checkpoint_id = req.checkpoint_id.clone();

        let stream = async_stream::stream! {
            for (i, chunk_data) in chunks.into_iter().enumerate() {
                yield Ok(proto::ShardChunk {
                    shard_id: shard_id.clone(),
                    checkpoint_id: checkpoint_id.clone(),
                    offset: (i * 4 * 1024 * 1024) as u64,
                    data: chunk_data.to_vec(),
                    is_last: i == total_chunks - 1,
                });
            }
        };

        Ok(Response::new(Box::pin(stream)))
    }

    #[instrument(skip(self, request))]
    async fn commit_checkpoint(
        &self,
        request: Request<proto::CommitRequest>,
    ) -> Result<Response<proto::CommitResponse>, Status> {
        let start = std::time::Instant::now();
        let req = request.into_inner();

        let shards: Vec<ManifestShard> = req
            .shards
            .iter()
            .map(|s| ManifestShard {
                shard_id: s.shard_id.clone(),
                rank: s.rank,
                size_bytes: s.size_bytes,
                sha256: s.sha256.clone(),
                storage_key: s.storage_key.clone(),
            })
            .collect();

        let total_bytes: u64 = shards.iter().map(|s| s.size_bytes).sum();

        let manifest = Manifest {
            checkpoint_id: req.checkpoint_id.clone(),
            run_id: req.run_id.clone(),
            step: req.step,
            created_at: chrono::Utc::now().to_rfc3339(),
            num_shards: shards.len() as u32,
            total_bytes,
            shards,
            metadata: req.metadata,
        };

        match self.manifest_mgr.write_manifest(&manifest).await {
            Ok(key) => {
                metrics::CHECKPOINT_COMMITS_TOTAL.with_label_values(&["success"]).inc();
                metrics::CHECKPOINT_COMMIT_DURATION_SECONDS
                    .with_label_values(&["success"])
                    .observe(start.elapsed().as_secs_f64());
                metrics::GRPC_REQUESTS_TOTAL
                    .with_label_values(&["commit_checkpoint", "OK"])
                    .inc();
                info!(
                    checkpoint_id = %req.checkpoint_id,
                    manifest_key = %key,
                    "Checkpoint committed"
                );
                Ok(Response::new(proto::CommitResponse {
                    success: true,
                    manifest_key: key,
                    error_message: String::new(),
                }))
            }
            Err(e) => {
                metrics::CHECKPOINT_COMMITS_TOTAL.with_label_values(&["error"]).inc();
                metrics::CHECKPOINT_COMMIT_DURATION_SECONDS
                    .with_label_values(&["error"])
                    .observe(start.elapsed().as_secs_f64());
                metrics::GRPC_REQUESTS_TOTAL
                    .with_label_values(&["commit_checkpoint", "ERROR"])
                    .inc();
                error!(error = %e, "Failed to commit checkpoint");
                Ok(Response::new(proto::CommitResponse {
                    success: false,
                    manifest_key: String::new(),
                    error_message: e.to_string(),
                }))
            }
        }
    }

    #[instrument(skip(self, request))]
    async fn abort_checkpoint(
        &self,
        request: Request<proto::AbortRequest>,
    ) -> Result<Response<proto::AbortResponse>, Status> {
        let req = request.into_inner();

        match self
            .gc
            .delete_checkpoint_shards(&req.run_id, &req.checkpoint_id)
            .await
        {
            Ok(deleted) => {
                metrics::CHECKPOINT_ABORTS_TOTAL.with_label_values(&["success"]).inc();
                metrics::GC_SHARDS_DELETED_TOTAL
                    .with_label_values(&["abort"])
                    .inc_by(deleted as f64);
                metrics::GRPC_REQUESTS_TOTAL
                    .with_label_values(&["abort_checkpoint", "OK"])
                    .inc();
                Ok(Response::new(proto::AbortResponse {
                    success: true,
                    shards_deleted: deleted,
                }))
            }
            Err(e) => {
                metrics::CHECKPOINT_ABORTS_TOTAL.with_label_values(&["error"]).inc();
                metrics::GRPC_REQUESTS_TOTAL
                    .with_label_values(&["abort_checkpoint", "ERROR"])
                    .inc();
                error!(error = %e, "Failed to abort checkpoint");
                Err(Status::internal(format!("Abort failed: {}", e)))
            }
        }
    }

    #[instrument(skip(self, request))]
    async fn get_shard_status(
        &self,
        request: Request<proto::ShardStatusRequest>,
    ) -> Result<Response<proto::ShardStatusResponse>, Status> {
        let req = request.into_inner();
        metrics::GRPC_REQUESTS_TOTAL
            .with_label_values(&["get_shard_status", "OK"])
            .inc();
        Ok(Response::new(proto::ShardStatusResponse {
            shard_id: req.shard_id,
            exists: false,
            size_bytes: 0,
            sha256_checksum: String::new(),
        }))
    }

    #[instrument(skip(self, _request))]
    async fn health_check(
        &self,
        _request: Request<proto::HealthRequest>,
    ) -> Result<Response<proto::HealthResponse>, Status> {
        metrics::GRPC_REQUESTS_TOTAL
            .with_label_values(&["health_check", "OK"])
            .inc();
        Ok(Response::new(proto::HealthResponse {
            serving: true,
            queue_depth: self.backpressure.depth() as u64,
            memory_used_bytes: 0,
            active_uploads: 0,
        }))
    }
}

pub async fn build_grpc_server(
    config: Config,
) -> Result<
    proto::checkpoint_service_server::CheckpointServiceServer<CheckpointServiceImpl>,
    Box<dyn std::error::Error + Send + Sync>,
> {
    let s3 = S3Client::new(
        &config.s3_endpoint,
        &config.s3_region,
        &config.s3_access_key,
        &config.s3_secret_key,
    )
    .await?;

    s3.ensure_bucket(&config.s3_bucket).await?;

    let writer = Arc::new(ShardWriter::new(s3.clone(), config.s3_bucket.clone()));
    let reader = Arc::new(ShardReader::new(s3.clone(), config.s3_bucket.clone()));
    let manifest_mgr = Arc::new(ManifestManager::new(s3.clone(), config.s3_bucket.clone()));
    let gc = Arc::new(GarbageCollector::new(s3.clone(), config.s3_bucket.clone()));
    let backpressure = Arc::new(BackpressureController::new(
        config.backpressure_queue_depth,
    ));

    let svc = CheckpointServiceImpl {
        writer,
        reader,
        manifest_mgr,
        gc,
        backpressure,
        bucket: config.s3_bucket,
    };

    Ok(proto::checkpoint_service_server::CheckpointServiceServer::new(svc))
}
