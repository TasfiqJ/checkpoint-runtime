// Integration tests for the checkpoint data plane.
// These tests require a running MinIO instance.
// Run with: cargo test --test integration_test -- --ignored
//
// Start MinIO first:
//   docker run -p 9000:9000 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin minio/minio server /data

use bytes::Bytes;

mod common {
    use super::*;

    pub async fn create_s3_client() -> ckpt_dataplane::storage::s3::S3Client {
        let endpoint = std::env::var("S3_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());
        ckpt_dataplane::storage::s3::S3Client::new(
            &endpoint,
            "us-east-1",
            "minioadmin",
            "minioadmin",
        )
        .await
        .expect("Failed to create S3 client")
    }
}

#[tokio::test]
#[ignore = "requires MinIO"]
async fn test_s3_put_and_get() {
    let s3 = common::create_s3_client().await;
    let bucket = "test-integration";
    s3.ensure_bucket(bucket).await.unwrap();

    let key = "test/hello.txt";
    let data = Bytes::from("hello world");
    s3.put_object(bucket, key, data.clone()).await.unwrap();

    let retrieved = s3.get_object(bucket, key).await.unwrap();
    assert_eq!(retrieved.as_ref(), b"hello world");

    // Cleanup
    s3.delete_object(bucket, key).await.unwrap();
}

#[tokio::test]
#[ignore = "requires MinIO"]
async fn test_s3_object_exists() {
    let s3 = common::create_s3_client().await;
    let bucket = "test-integration";
    s3.ensure_bucket(bucket).await.unwrap();

    assert!(!s3.object_exists(bucket, "nonexistent").await.unwrap());

    s3.put_object(bucket, "exists-test", Bytes::from("data")).await.unwrap();
    assert!(s3.object_exists(bucket, "exists-test").await.unwrap());

    s3.delete_object(bucket, "exists-test").await.unwrap();
}

#[tokio::test]
#[ignore = "requires MinIO"]
async fn test_s3_list_objects() {
    let s3 = common::create_s3_client().await;
    let bucket = "test-integration";
    s3.ensure_bucket(bucket).await.unwrap();

    // Write multiple objects under a prefix
    for i in 0..3 {
        let key = format!("list-test/obj-{}.bin", i);
        s3.put_object(bucket, &key, Bytes::from(format!("data-{}", i)))
            .await
            .unwrap();
    }

    let objects = s3.list_objects(bucket, "list-test/").await.unwrap();
    assert_eq!(objects.len(), 3);

    // Cleanup
    for key in &objects {
        s3.delete_object(bucket, key).await.unwrap();
    }
}

#[tokio::test]
#[ignore = "requires MinIO"]
async fn test_write_shard_with_checksum() {
    let s3 = common::create_s3_client().await;
    let bucket = "test-integration";
    s3.ensure_bucket(bucket).await.unwrap();

    let writer = ckpt_dataplane::checkpoint::writer::ShardWriter::new(s3.clone(), bucket.to_string());

    let data = vec![
        Bytes::from(vec![0u8; 1024]),
        Bytes::from(vec![1u8; 1024]),
    ];

    let result = writer
        .write_shard("run-test", "ckpt-001", "shard-0", data)
        .await
        .unwrap();

    assert_eq!(result.shard_id, "shard-0");
    assert_eq!(result.total_bytes, 2048);
    assert!(!result.sha256_checksum.is_empty());

    // Verify the shard file exists
    assert!(s3.object_exists(bucket, &result.storage_key).await.unwrap());

    // Verify the checksum sidecar exists
    let checksum_key = format!("run-test/ckpt-001/shard-0.sha256");
    assert!(s3.object_exists(bucket, &checksum_key).await.unwrap());

    // Verify checksum content matches
    let stored_checksum = s3.get_object(bucket, &checksum_key).await.unwrap();
    assert_eq!(
        String::from_utf8(stored_checksum.to_vec()).unwrap(),
        result.sha256_checksum
    );

    // Cleanup
    s3.delete_object(bucket, &result.storage_key).await.unwrap();
    s3.delete_object(bucket, &checksum_key).await.unwrap();
}

#[tokio::test]
#[ignore = "requires MinIO"]
async fn test_manifest_write_and_read() {
    let s3 = common::create_s3_client().await;
    let bucket = "test-integration";
    s3.ensure_bucket(bucket).await.unwrap();

    let mgr = ckpt_dataplane::checkpoint::manifest::ManifestManager::new(s3.clone(), bucket.to_string());

    let manifest = ckpt_dataplane::checkpoint::manifest::Manifest {
        checkpoint_id: "ckpt-test-001".to_string(),
        run_id: "run-manifest-test".to_string(),
        step: 42,
        created_at: "2026-03-04T12:00:00Z".to_string(),
        num_shards: 2,
        total_bytes: 4096,
        shards: vec![
            ckpt_dataplane::checkpoint::manifest::ManifestShard {
                shard_id: "shard-0".to_string(),
                rank: 0,
                size_bytes: 2048,
                sha256: "abc123".to_string(),
            },
            ckpt_dataplane::checkpoint::manifest::ManifestShard {
                shard_id: "shard-1".to_string(),
                rank: 1,
                size_bytes: 2048,
                sha256: "def456".to_string(),
            },
        ],
        metadata: std::collections::HashMap::new(),
    };

    let key = mgr.write_manifest(&manifest).await.unwrap();
    assert!(key.contains("_manifest.json"));

    // Read it back
    let read_manifest = mgr.read_manifest("run-manifest-test", "ckpt-test-001").await.unwrap();
    assert!(read_manifest.is_some());
    let read = read_manifest.unwrap();
    assert_eq!(read.step, 42);
    assert_eq!(read.num_shards, 2);

    // Idempotent write
    let key2 = mgr.write_manifest(&manifest).await.unwrap();
    assert_eq!(key, key2);

    // Cleanup
    s3.delete_object(bucket, &key).await.unwrap();
}

#[tokio::test]
#[ignore = "requires MinIO"]
async fn test_gc_deletes_orphaned_shards() {
    let s3 = common::create_s3_client().await;
    let bucket = "test-integration";
    s3.ensure_bucket(bucket).await.unwrap();

    let gc = ckpt_dataplane::checkpoint::gc::GarbageCollector::new(s3.clone(), bucket.to_string());

    // Create an orphaned checkpoint (shards without manifest)
    let run_id = "run-gc-test";
    s3.put_object(bucket, &format!("{}/orphan-ckpt/shard-0.bin", run_id), Bytes::from("data"))
        .await
        .unwrap();
    s3.put_object(bucket, &format!("{}/orphan-ckpt/shard-0.sha256", run_id), Bytes::from("hash"))
        .await
        .unwrap();

    // Create a committed checkpoint (with manifest)
    s3.put_object(bucket, &format!("{}/valid-ckpt/shard-0.bin", run_id), Bytes::from("data"))
        .await
        .unwrap();
    s3.put_object(bucket, &format!("{}/valid-ckpt/_manifest.json", run_id), Bytes::from("{}"))
        .await
        .unwrap();

    // Run GC
    let deleted = gc.collect_orphans(run_id).await.unwrap();
    assert_eq!(deleted, 2); // orphan shard + checksum deleted

    // Valid checkpoint should still exist
    assert!(s3.object_exists(bucket, &format!("{}/valid-ckpt/shard-0.bin", run_id)).await.unwrap());
    assert!(s3.object_exists(bucket, &format!("{}/valid-ckpt/_manifest.json", run_id)).await.unwrap());

    // Orphan should be gone
    assert!(!s3.object_exists(bucket, &format!("{}/orphan-ckpt/shard-0.bin", run_id)).await.unwrap());

    // Cleanup
    s3.delete_object(bucket, &format!("{}/valid-ckpt/shard-0.bin", run_id)).await.unwrap();
    s3.delete_object(bucket, &format!("{}/valid-ckpt/_manifest.json", run_id)).await.unwrap();
}
