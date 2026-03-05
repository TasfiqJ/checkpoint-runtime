use bytes::Bytes;
use sha2::{Digest, Sha256};
use tracing::{info, instrument};

use crate::storage::s3::S3Client;

pub struct ShardWriter {
    s3: S3Client,
    bucket: String,
}

#[derive(Debug)]
pub struct WriteResult {
    pub shard_id: String,
    pub total_bytes: u64,
    pub sha256_checksum: String,
    pub storage_key: String,
}

/// Build a content-addressed storage key.
///
/// The key includes the run/checkpoint hierarchy for listing and GC,
/// but embeds the SHA-256 digest so that two identical payloads map to
/// the same object.  Re-uploading a shard with a matching checksum is
/// therefore a no-op at the storage layer (idempotent write).
fn content_addressed_key(run_id: &str, checkpoint_id: &str, shard_id: &str, sha256: &str) -> String {
    format!("{}/{}/sha256-{}-{}.bin", run_id, checkpoint_id, &sha256[..16], shard_id)
}

impl ShardWriter {
    pub fn new(s3: S3Client, bucket: String) -> Self {
        Self { s3, bucket }
    }

    #[instrument(skip(self, data), fields(shard_id, checkpoint_id))]
    pub async fn write_shard(
        &self,
        run_id: &str,
        checkpoint_id: &str,
        shard_id: &str,
        data: Vec<Bytes>,
    ) -> Result<WriteResult, Box<dyn std::error::Error + Send + Sync>> {
        let mut hasher = Sha256::new();
        let mut total_bytes: u64 = 0;

        let mut combined = Vec::new();
        for chunk in &data {
            hasher.update(chunk);
            total_bytes += chunk.len() as u64;
            combined.extend_from_slice(chunk);
        }

        let checksum = hex::encode(hasher.finalize());

        // Content-addressed key: embeds checksum prefix for deduplication
        let storage_key = content_addressed_key(run_id, checkpoint_id, shard_id, &checksum);

        // Idempotent write: skip upload if an object with this content-addressed key already exists
        if self.s3.object_exists(&self.bucket, &storage_key).await? {
            info!(
                shard_id,
                checkpoint_id,
                total_bytes,
                checksum = %checksum,
                "Shard already exists (content-addressed dedup), skipping upload"
            );
        } else {
            self.s3
                .put_object(&self.bucket, &storage_key, Bytes::from(combined))
                .await?;
        }

        // Write checksum sidecar
        let checksum_key = format!("{}/{}/{}.sha256", run_id, checkpoint_id, shard_id);
        self.s3
            .put_object(&self.bucket, &checksum_key, Bytes::from(checksum.clone()))
            .await?;

        info!(
            shard_id,
            checkpoint_id,
            total_bytes,
            checksum = %checksum,
            storage_key = %storage_key,
            "Shard written successfully"
        );

        Ok(WriteResult {
            shard_id: shard_id.to_string(),
            total_bytes,
            sha256_checksum: checksum,
            storage_key,
        })
    }
}
