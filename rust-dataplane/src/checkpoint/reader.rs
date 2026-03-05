use bytes::Bytes;
use tracing::instrument;

use crate::storage::s3::S3Client;

pub struct ShardReader {
    s3: S3Client,
    bucket: String,
}

impl ShardReader {
    pub fn new(s3: S3Client, bucket: String) -> Self {
        Self { s3, bucket }
    }

    #[instrument(skip(self), fields(shard_id, checkpoint_id))]
    pub async fn read_shard(
        &self,
        run_id: &str,
        checkpoint_id: &str,
        shard_id: &str,
        chunk_size: usize,
    ) -> Result<Vec<Bytes>, Box<dyn std::error::Error + Send + Sync>> {
        let storage_key = format!("{}/{}/{}.bin", run_id, checkpoint_id, shard_id);
        let data = self.s3.get_object(&self.bucket, &storage_key).await?;

        let mut chunks = Vec::new();
        let bytes = data.as_ref();
        for chunk in bytes.chunks(chunk_size) {
            chunks.push(Bytes::copy_from_slice(chunk));
        }

        Ok(chunks)
    }
}
