use bytes::{Bytes, BytesMut};
use sha2::{Digest, Sha256};
use tokio::sync::mpsc;
use tracing::{info, instrument};

use crate::storage::s3::S3Client;

const MULTIPART_PART_SIZE: usize = 5 * 1024 * 1024;
const PIPELINE_DEPTH: usize = 8;

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
fn content_addressed_key(
    run_id: &str,
    checkpoint_id: &str,
    shard_id: &str,
    sha256: &str,
) -> String {
    format!(
        "{}/{}/sha256-{}-{}.bin",
        run_id,
        checkpoint_id,
        &sha256[..16],
        shard_id
    )
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
        let (tx, rx) = mpsc::channel(PIPELINE_DEPTH);
        let producer = tokio::spawn(async move {
            for chunk in data {
                tx.send(Ok(chunk))
                    .await
                    .map_err(|_| "shard writer stopped receiving chunks")?;
            }
            Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
        });

        let result = self
            .write_shard_stream(run_id, checkpoint_id, shard_id, rx)
            .await;
        producer.await??;
        result
    }

    /// Stream a shard through a bounded pipeline.
    ///
    /// The checksum worker receives cheap `Bytes` clones on a blocking thread,
    /// while the async task uploads five-MiB multipart batches. The upload uses
    /// a staging key because the content-addressed final key is not known until
    /// SHA-256 completes.
    #[instrument(skip(self, data), fields(shard_id, checkpoint_id))]
    pub async fn write_shard_stream(
        &self,
        run_id: &str,
        checkpoint_id: &str,
        shard_id: &str,
        mut data: mpsc::Receiver<Result<Bytes, String>>,
    ) -> Result<WriteResult, Box<dyn std::error::Error + Send + Sync>> {
        let staging_key = format!(
            "{}/{}/.multipart-{}-{}",
            run_id,
            checkpoint_id,
            shard_id,
            uuid::Uuid::new_v4()
        );
        let upload_id = self
            .s3
            .create_multipart_upload(&self.bucket, &staging_key)
            .await?;

        let (checksum_tx, mut checksum_rx) = mpsc::channel::<Bytes>(PIPELINE_DEPTH);
        let checksum_task = tokio::task::spawn_blocking(move || {
            let mut hasher = Sha256::new();
            let mut total_bytes = 0_u64;
            while let Some(chunk) = checksum_rx.blocking_recv() {
                hasher.update(&chunk);
                total_bytes += chunk.len() as u64;
            }
            (hex::encode(hasher.finalize()), total_bytes)
        });

        let upload_result = async {
            let mut buffered_chunks: Vec<Bytes> = Vec::new();
            let mut buffered_bytes = 0_usize;
            let mut completed_parts = Vec::new();
            let mut part_number = 1_i32;

            while let Some(chunk) = data.recv().await {
                let chunk =
                    chunk.map_err(|message| -> Box<dyn std::error::Error + Send + Sync> {
                        message.into()
                    })?;
                checksum_tx
                    .send(chunk.clone())
                    .await
                    .map_err(|_| "checksum worker stopped receiving chunks")?;
                buffered_bytes += chunk.len();
                buffered_chunks.push(chunk);

                while buffered_bytes >= MULTIPART_PART_SIZE {
                    let part = take_part(
                        &mut buffered_chunks,
                        &mut buffered_bytes,
                        MULTIPART_PART_SIZE,
                    );
                    completed_parts.push(
                        self.s3
                            .upload_part(&self.bucket, &staging_key, &upload_id, part_number, part)
                            .await?,
                    );
                    part_number += 1;
                }
            }
            drop(checksum_tx);

            if buffered_bytes > 0 {
                let final_part_size = buffered_bytes;
                let final_part =
                    take_part(&mut buffered_chunks, &mut buffered_bytes, final_part_size);
                completed_parts.push(
                    self.s3
                        .upload_part(
                            &self.bucket,
                            &staging_key,
                            &upload_id,
                            part_number,
                            final_part,
                        )
                        .await?,
                );
            }

            if completed_parts.is_empty() {
                return Err("cannot write an empty shard".into());
            }

            self.s3
                .complete_multipart_upload(&self.bucket, &staging_key, &upload_id, completed_parts)
                .await
        }
        .await;

        if let Err(error) = upload_result {
            let _ = self
                .s3
                .abort_multipart_upload(&self.bucket, &staging_key, &upload_id)
                .await;
            return Err(error);
        }

        let (checksum, total_bytes) = checksum_task.await?;

        // Content-addressed key: embeds checksum prefix for deduplication
        let storage_key = content_addressed_key(run_id, checkpoint_id, shard_id, &checksum);

        // Promote the streamed staging object after the digest determines its final key.
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
                .copy_object(&self.bucket, &staging_key, &storage_key)
                .await?;
        }
        self.s3.delete_object(&self.bucket, &staging_key).await?;

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

/// Remove up to `part_size` bytes from a list of reference-counted chunks.
/// Only a single multipart part is made contiguous; the complete shard is
/// never copied into one allocation.
fn take_part(chunks: &mut Vec<Bytes>, buffered_bytes: &mut usize, part_size: usize) -> Bytes {
    if chunks.len() == 1 && chunks[0].len() == part_size {
        *buffered_bytes -= part_size;
        return chunks.remove(0);
    }

    let mut part = BytesMut::with_capacity(part_size);
    while part.len() < part_size {
        let remaining = part_size - part.len();
        let take = remaining.min(chunks[0].len());
        let fragment = chunks[0].split_to(take);
        part.extend_from_slice(&fragment);
        if chunks[0].is_empty() {
            chunks.remove(0);
        }
    }
    *buffered_bytes -= part_size;
    part.freeze()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn take_part_preserves_chunk_remainder() {
        let mut chunks = vec![Bytes::from_static(b"abc"), Bytes::from_static(b"defg")];
        let mut buffered = 7;
        let part = take_part(&mut chunks, &mut buffered, 5);

        assert_eq!(&part[..], b"abcde");
        assert_eq!(buffered, 2);
        assert_eq!(&chunks[0][..], b"fg");
    }
}
