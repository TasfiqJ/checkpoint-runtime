use tracing::{info, warn, instrument};

use crate::storage::s3::S3Client;

pub struct GarbageCollector {
    s3: S3Client,
    bucket: String,
}

impl GarbageCollector {
    pub fn new(s3: S3Client, bucket: String) -> Self {
        Self { s3, bucket }
    }

    /// Delete all shards for a specific checkpoint (used by AbortCheckpoint).
    #[instrument(skip(self))]
    pub async fn delete_checkpoint_shards(
        &self,
        run_id: &str,
        checkpoint_id: &str,
    ) -> Result<u32, Box<dyn std::error::Error + Send + Sync>> {
        let prefix = format!("{}/{}/", run_id, checkpoint_id);
        let objects = self.s3.list_objects(&self.bucket, &prefix).await?;

        let mut deleted = 0u32;
        for key in &objects {
            // Don't delete the manifest itself during abort
            if key.ends_with("_manifest.json") {
                continue;
            }
            self.s3.delete_object(&self.bucket, key).await?;
            deleted += 1;
        }

        info!(run_id, checkpoint_id, deleted, "Checkpoint shards deleted");
        Ok(deleted)
    }

    /// Scan for checkpoint directories without manifests and delete orphaned shards.
    #[instrument(skip(self))]
    pub async fn collect_orphans(
        &self,
        run_id: &str,
    ) -> Result<u32, Box<dyn std::error::Error + Send + Sync>> {
        let prefix = format!("{}/", run_id);
        let objects = self.s3.list_objects(&self.bucket, &prefix).await?;

        // Group objects by checkpoint_id
        let mut checkpoints: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();

        for key in &objects {
            let parts: Vec<&str> = key.split('/').collect();
            if parts.len() >= 3 {
                let ckpt_id = parts[1].to_string();
                checkpoints
                    .entry(ckpt_id)
                    .or_default()
                    .push(key.clone());
            }
        }

        let mut total_deleted = 0u32;

        for (ckpt_id, keys) in &checkpoints {
            let manifest_key = format!("{}/{}/_manifest.json", run_id, ckpt_id);
            let has_manifest = keys.iter().any(|k| k == &manifest_key);

            if !has_manifest {
                warn!(
                    run_id,
                    checkpoint_id = %ckpt_id,
                    orphan_count = keys.len(),
                    "Found orphaned checkpoint without manifest, cleaning up"
                );
                for key in keys {
                    self.s3.delete_object(&self.bucket, key).await?;
                    total_deleted += 1;
                }
            }
        }

        info!(run_id, total_deleted, "Orphan GC complete");
        Ok(total_deleted)
    }
}
