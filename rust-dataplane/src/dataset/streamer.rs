use tracing::instrument;

use crate::storage::s3::S3Client;

pub struct DatasetStreamer {
    s3: S3Client,
    bucket: String,
}

impl DatasetStreamer {
    pub fn new(s3: S3Client, bucket: String) -> Self {
        Self { s3, bucket }
    }

    #[instrument(skip(self))]
    pub async fn stream_shard(
        &self,
        dataset_id: &str,
        shard_index: u32,
        chunk_size: usize,
    ) -> Result<Vec<bytes::Bytes>, Box<dyn std::error::Error + Send + Sync>> {
        let key = format!("datasets/{}/shard-{}.bin", dataset_id, shard_index);
        let data = self.s3.get_object(&self.bucket, &key).await?;

        let mut chunks = Vec::new();
        for chunk in data.chunks(chunk_size) {
            chunks.push(bytes::Bytes::copy_from_slice(chunk));
        }

        Ok(chunks)
    }
}
