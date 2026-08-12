use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{CompletedMultipartUpload, CompletedPart};
use bytes::Bytes;
use tracing::instrument;

#[derive(Clone)]
pub struct S3Client {
    client: aws_sdk_s3::Client,
}

impl S3Client {
    pub async fn new(
        endpoint: &str,
        region: &str,
        access_key: &str,
        secret_key: &str,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let creds =
            aws_credential_types::Credentials::new(access_key, secret_key, None, None, "static");

        let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region(aws_types::region::Region::new(region.to_string()))
            .credentials_provider(creds)
            .endpoint_url(endpoint)
            .load()
            .await;

        let s3_config = aws_sdk_s3::config::Builder::from(&config)
            .force_path_style(true)
            .build();

        let client = aws_sdk_s3::Client::from_conf(s3_config);

        Ok(Self { client })
    }

    pub async fn ensure_bucket(
        &self,
        bucket: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match self.client.head_bucket().bucket(bucket).send().await {
            Ok(_) => Ok(()),
            Err(_) => {
                self.client.create_bucket().bucket(bucket).send().await?;
                Ok(())
            }
        }
    }

    #[instrument(skip(self, data), fields(bucket, key))]
    pub async fn put_object(
        &self,
        bucket: &str,
        key: &str,
        data: Bytes,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.client
            .put_object()
            .bucket(bucket)
            .key(key)
            .body(ByteStream::from(data))
            .send()
            .await?;
        Ok(())
    }

    pub async fn create_multipart_upload(
        &self,
        bucket: &str,
        key: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let response = self
            .client
            .create_multipart_upload()
            .bucket(bucket)
            .key(key)
            .send()
            .await?;

        response
            .upload_id()
            .map(str::to_owned)
            .ok_or_else(|| "S3 did not return an upload ID".into())
    }

    pub async fn upload_part(
        &self,
        bucket: &str,
        key: &str,
        upload_id: &str,
        part_number: i32,
        data: Bytes,
    ) -> Result<CompletedPart, Box<dyn std::error::Error + Send + Sync>> {
        let response = self
            .client
            .upload_part()
            .bucket(bucket)
            .key(key)
            .upload_id(upload_id)
            .part_number(part_number)
            .body(ByteStream::from(data))
            .send()
            .await?;

        Ok(CompletedPart::builder()
            .part_number(part_number)
            .set_e_tag(response.e_tag().map(str::to_owned))
            .build())
    }

    pub async fn complete_multipart_upload(
        &self,
        bucket: &str,
        key: &str,
        upload_id: &str,
        parts: Vec<CompletedPart>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let upload = CompletedMultipartUpload::builder()
            .set_parts(Some(parts))
            .build();
        self.client
            .complete_multipart_upload()
            .bucket(bucket)
            .key(key)
            .upload_id(upload_id)
            .multipart_upload(upload)
            .send()
            .await?;
        Ok(())
    }

    pub async fn abort_multipart_upload(
        &self,
        bucket: &str,
        key: &str,
        upload_id: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.client
            .abort_multipart_upload()
            .bucket(bucket)
            .key(key)
            .upload_id(upload_id)
            .send()
            .await?;
        Ok(())
    }

    pub async fn copy_object(
        &self,
        bucket: &str,
        source_key: &str,
        destination_key: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.client
            .copy_object()
            .bucket(bucket)
            .copy_source(format!("{bucket}/{source_key}"))
            .key(destination_key)
            .send()
            .await?;
        Ok(())
    }

    #[instrument(skip(self), fields(bucket, key))]
    pub async fn get_object(
        &self,
        bucket: &str,
        key: &str,
    ) -> Result<Bytes, Box<dyn std::error::Error + Send + Sync>> {
        let resp = self
            .client
            .get_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await?;

        let data = resp.body.collect().await?.into_bytes();
        Ok(data)
    }

    #[instrument(skip(self), fields(bucket, key))]
    pub async fn delete_object(
        &self,
        bucket: &str,
        key: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.client
            .delete_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await?;
        Ok(())
    }

    #[instrument(skip(self), fields(bucket, key))]
    pub async fn object_exists(
        &self,
        bucket: &str,
        key: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        match self
            .client
            .head_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
        {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    #[instrument(skip(self), fields(bucket, prefix))]
    pub async fn list_objects(
        &self,
        bucket: &str,
        prefix: &str,
    ) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
        let mut keys = Vec::new();
        let mut continuation_token: Option<String> = None;

        loop {
            let mut req = self.client.list_objects_v2().bucket(bucket).prefix(prefix);

            if let Some(token) = continuation_token.take() {
                req = req.continuation_token(token);
            }

            let resp = req.send().await?;

            for obj in resp.contents() {
                if let Some(key) = obj.key() {
                    keys.push(key.to_string());
                }
            }

            if resp.is_truncated() == Some(true) {
                continuation_token = resp.next_continuation_token().map(|s| s.to_string());
            } else {
                break;
            }
        }

        Ok(keys)
    }
}
