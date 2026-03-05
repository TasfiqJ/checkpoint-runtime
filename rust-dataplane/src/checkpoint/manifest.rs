use bytes::Bytes;
use serde::{Deserialize, Serialize};
use tracing::{info, instrument};

use crate::storage::s3::S3Client;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub checkpoint_id: String,
    pub run_id: String,
    pub step: u64,
    pub created_at: String,
    pub num_shards: u32,
    pub total_bytes: u64,
    pub shards: Vec<ManifestShard>,
    #[serde(default)]
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestShard {
    pub shard_id: String,
    pub rank: u32,
    pub size_bytes: u64,
    pub sha256: String,
}

pub struct ManifestManager {
    s3: S3Client,
    bucket: String,
}

impl ManifestManager {
    pub fn new(s3: S3Client, bucket: String) -> Self {
        Self { s3, bucket }
    }

    #[instrument(skip(self, manifest))]
    pub async fn write_manifest(
        &self,
        manifest: &Manifest,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let key = format!(
            "{}/{}/_manifest.json",
            manifest.run_id, manifest.checkpoint_id
        );

        // Check idempotency: if manifest already exists, return success
        if self.s3.object_exists(&self.bucket, &key).await? {
            info!(key, "Manifest already exists, returning success (idempotent)");
            return Ok(key);
        }

        let json = serde_json::to_string_pretty(manifest)?;
        self.s3
            .put_object(&self.bucket, &key, Bytes::from(json))
            .await?;

        info!(key, "Manifest written — checkpoint committed");
        Ok(key)
    }

    #[instrument(skip(self))]
    pub async fn read_manifest(
        &self,
        run_id: &str,
        checkpoint_id: &str,
    ) -> Result<Option<Manifest>, Box<dyn std::error::Error + Send + Sync>> {
        let key = format!("{}/{}/_manifest.json", run_id, checkpoint_id);

        if !self.s3.object_exists(&self.bucket, &key).await? {
            return Ok(None);
        }

        let data = self.s3.get_object(&self.bucket, &key).await?;
        let manifest: Manifest = serde_json::from_slice(&data)?;
        Ok(Some(manifest))
    }

    pub async fn manifest_exists(
        &self,
        run_id: &str,
        checkpoint_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let key = format!("{}/{}/_manifest.json", run_id, checkpoint_id);
        self.s3.object_exists(&self.bucket, &key).await
    }
}
