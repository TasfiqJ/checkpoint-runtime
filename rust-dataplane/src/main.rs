use tracing::info;

use ckpt_dataplane::config::Config;
use ckpt_dataplane::grpc_service;
use ckpt_dataplane::telemetry;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let cfg = Config::from_env();
    telemetry::init_telemetry(&cfg);

    info!(
        grpc_port = cfg.grpc_port,
        metrics_port = cfg.metrics_port,
        "Starting checkpoint-runtime data plane"
    );

    // Build Prometheus metrics endpoint
    let metrics_addr: std::net::SocketAddr =
        format!("0.0.0.0:{}", cfg.metrics_port).parse()?;

    let grpc_addr = format!("0.0.0.0:{}", cfg.grpc_port).parse()?;
    let svc = grpc_service::build_grpc_server(cfg).await?;

    info!(%grpc_addr, "gRPC server listening");
    info!(%metrics_addr, "Prometheus metrics server listening");

    // Run gRPC server and metrics HTTP server concurrently
    tokio::select! {
        result = tonic::transport::Server::builder()
            .add_service(svc)
            .serve(grpc_addr) => {
            result?;
        }
        result = serve_metrics(metrics_addr) => {
            result?;
        }
    }

    Ok(())
}

/// Serve Prometheus metrics on a plain HTTP endpoint at /metrics.
async fn serve_metrics(
    addr: std::net::SocketAddr,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use hyper::body::Incoming;
    use hyper::{Request, Response};
    use hyper_util::rt::TokioIo;
    use http_body_util::Full;
    use bytes::Bytes;
    use prometheus::Encoder;

    let listener = tokio::net::TcpListener::bind(addr).await?;

    loop {
        let (stream, _) = listener.accept().await?;
        let io = TokioIo::new(stream);

        tokio::spawn(async move {
            let service = hyper::service::service_fn(|req: Request<Incoming>| async move {
                match req.uri().path() {
                    "/metrics" => {
                        let encoder = prometheus::TextEncoder::new();
                        let metric_families = prometheus::gather();
                        let mut buffer = Vec::new();
                        encoder.encode(&metric_families, &mut buffer).unwrap();
                        Response::builder()
                            .header("Content-Type", encoder.format_type())
                            .body(Full::new(Bytes::from(buffer)))
                    }
                    "/health" => Response::builder()
                        .status(200)
                        .body(Full::new(Bytes::from_static(b"{\"status\":\"ok\"}"))),
                    _ => Response::builder()
                        .status(404)
                        .body(Full::new(Bytes::from_static(b"Not Found"))),
                }
            });

            if let Err(err) =
                hyper::server::conn::http1::Builder::new()
                    .serve_connection(io, service)
                    .await
            {
                tracing::error!(error = %err, "Metrics server connection error");
            }
        });
    }
}
