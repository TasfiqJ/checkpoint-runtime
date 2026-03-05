use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub grpc_port: u16,
    pub metrics_port: u16,
    pub s3_endpoint: String,
    pub s3_bucket: String,
    pub s3_region: String,
    pub s3_access_key: String,
    pub s3_secret_key: String,
    pub backpressure_queue_depth: usize,
    pub max_concurrent_uploads: usize,
    pub retry_max_attempts: u32,
    pub retry_base_delay_ms: u64,
    pub otel_endpoint: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            grpc_port: env_or("GRPC_PORT", "50051").parse().unwrap_or(50051),
            metrics_port: env_or("METRICS_PORT", "9090").parse().unwrap_or(9090),
            s3_endpoint: env_or("S3_ENDPOINT", "http://minio:9000"),
            s3_bucket: env_or("S3_BUCKET", "checkpoints"),
            s3_region: env_or("S3_REGION", "us-east-1"),
            s3_access_key: env_or("S3_ACCESS_KEY", "minioadmin"),
            s3_secret_key: env_or("S3_SECRET_KEY", "minioadmin"),
            backpressure_queue_depth: env_or("BACKPRESSURE_QUEUE_DEPTH", "32")
                .parse()
                .unwrap_or(32),
            max_concurrent_uploads: env_or("MAX_CONCURRENT_UPLOADS", "8")
                .parse()
                .unwrap_or(8),
            retry_max_attempts: env_or("RETRY_MAX_ATTEMPTS", "5")
                .parse()
                .unwrap_or(5),
            retry_base_delay_ms: env_or("RETRY_BASE_DELAY_MS", "100")
                .parse()
                .unwrap_or(100),
            otel_endpoint: env_or("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4317"),
        }
    }
}

fn env_or(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}
