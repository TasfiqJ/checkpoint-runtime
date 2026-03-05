use prometheus::{
    register_counter_vec, register_histogram_vec, register_int_gauge, CounterVec, HistogramVec,
    IntGauge,
};

lazy_static::lazy_static! {
    // --- Shard write metrics ---
    pub static ref SHARD_WRITES_TOTAL: CounterVec = register_counter_vec!(
        "ckpt_shard_writes_total",
        "Total number of shard write operations",
        &["status"]
    ).unwrap();

    pub static ref SHARD_WRITE_BYTES_TOTAL: CounterVec = register_counter_vec!(
        "ckpt_shard_write_bytes_total",
        "Total bytes written across all shards",
        &["run_id"]
    ).unwrap();

    pub static ref SHARD_WRITE_DURATION_SECONDS: HistogramVec = register_histogram_vec!(
        "ckpt_shard_write_duration_seconds",
        "Time to write a single shard to S3",
        &["status"],
        vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
    ).unwrap();

    // --- Shard read metrics ---
    pub static ref SHARD_READS_TOTAL: CounterVec = register_counter_vec!(
        "ckpt_shard_reads_total",
        "Total number of shard read operations",
        &["status"]
    ).unwrap();

    pub static ref SHARD_READ_DURATION_SECONDS: HistogramVec = register_histogram_vec!(
        "ckpt_shard_read_duration_seconds",
        "Time to read a single shard from S3",
        &["status"],
        vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
    ).unwrap();

    // --- Checkpoint commit metrics ---
    pub static ref CHECKPOINT_COMMITS_TOTAL: CounterVec = register_counter_vec!(
        "ckpt_checkpoint_commits_total",
        "Total number of checkpoint commit operations",
        &["status"]
    ).unwrap();

    pub static ref CHECKPOINT_COMMIT_DURATION_SECONDS: HistogramVec = register_histogram_vec!(
        "ckpt_checkpoint_commit_duration_seconds",
        "Time to commit a checkpoint (write manifest)",
        &["status"],
        vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
    ).unwrap();

    // --- Abort / GC metrics ---
    pub static ref CHECKPOINT_ABORTS_TOTAL: CounterVec = register_counter_vec!(
        "ckpt_checkpoint_aborts_total",
        "Total number of checkpoint abort operations",
        &["status"]
    ).unwrap();

    pub static ref GC_SHARDS_DELETED_TOTAL: CounterVec = register_counter_vec!(
        "ckpt_gc_shards_deleted_total",
        "Total shards deleted by GC or abort",
        &["reason"]
    ).unwrap();

    // --- Backpressure ---
    pub static ref BACKPRESSURE_QUEUE_DEPTH: IntGauge = register_int_gauge!(
        "ckpt_backpressure_queue_depth",
        "Current depth of the backpressure queue"
    ).unwrap();

    // --- gRPC ---
    pub static ref GRPC_REQUESTS_TOTAL: CounterVec = register_counter_vec!(
        "ckpt_grpc_requests_total",
        "Total gRPC requests by method and status",
        &["method", "status"]
    ).unwrap();
}
