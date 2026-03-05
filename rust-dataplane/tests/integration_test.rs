// Integration tests for the checkpoint data plane.
// These tests require a running MinIO instance.
// Run with: cargo test --test integration_test -- --ignored

#[tokio::test]
#[ignore = "requires MinIO"]
async fn test_write_and_read_shard() {
    // Will be implemented in Phase 1
    todo!("Integration test: write shard → read shard → verify checksum")
}

#[tokio::test]
#[ignore = "requires MinIO"]
async fn test_commit_checkpoint() {
    // Will be implemented in Phase 1
    todo!("Integration test: write shards → commit → verify manifest")
}

#[tokio::test]
#[ignore = "requires MinIO"]
async fn test_abort_and_gc() {
    // Will be implemented in Phase 1
    todo!("Integration test: write shards → abort → verify cleanup")
}
