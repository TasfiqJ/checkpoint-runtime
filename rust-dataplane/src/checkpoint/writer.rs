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
        let storage_key = format!("{}/{}/{}.bin", run_id, checkpoint_id, shard_id);

        self.s3
            .put_object(&self.bucket, &storage_key, Bytes::from(combined))
            .await?;

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
