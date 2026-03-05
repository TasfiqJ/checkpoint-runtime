use tracing::info;

mod config;
mod checkpoint;
mod dataset;
mod storage;
mod backpressure;
mod retry;
mod telemetry;
mod grpc_service;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cfg = config::Config::from_env();
    telemetry::init_telemetry(&cfg);

    info!(
        grpc_port = cfg.grpc_port,
        metrics_port = cfg.metrics_port,
        "Starting checkpoint-runtime data plane"
    );

    let addr = format!("0.0.0.0:{}", cfg.grpc_port).parse()?;

    let svc = grpc_service::build_grpc_server(cfg).await?;

    info!(%addr, "gRPC server listening");

    tonic::transport::Server::builder()
        .add_service(svc)
        .serve(addr)
        .await?;

    Ok(())
}
