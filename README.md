# Checkpoint Runtime

A fault-tolerant, high-throughput training checkpoint runtime with a Python control plane and Rust data plane.

## Why This Exists

Training large models across thousands of GPUs requires persistent, async checkpointing. Traditional synchronous saves waste millions in GPU idle time. This runtime eliminates that by streaming checkpoint shards to S3-compatible storage through a high-performance Rust data plane while the control plane orchestrates failure recovery and worker coordination.

## Architecture

```
                         +---------------------+
                         |   Operator Console   |
                         |  React + Tailwind    |
                         |   localhost:3000      |
                         +---------+-----------+
                                   | REST
                         +---------v-----------+
                         |   Control Plane      |
                         |  Python / FastAPI    |
                         |  Coordination + FSM  |
                         |   localhost:8000     |
                         +--+-------------+----+
                     gRPC   |             |  etcd v3
                            |             |  (leases, watches)
              +-------------v--+    +-----v-------+
              |   Data Plane   |    |    etcd      |
              |  Rust / Tonic  |    |   :2379      |
              |  Streaming I/O |    +-------------+
              |   :50051       |
              +------+---------+
                     | S3 API
              +------v---------+
              |     MinIO      |
              |  S3-compatible |
              |   :9000        |
              +----------------+

    +--------------+  +--------------+
    |  Worker 0    |  |  Worker 1    |
    |  PyTorch DDP |  |  PyTorch DDP |
    |  + SDK       |  |  + SDK       |
    +--------------+  +--------------+

  Observability: Prometheus (:9091) -> Grafana (:3001)
                 OTel Collector -> Jaeger (:16686)
```

## Quick Start

```bash
git clone https://github.com/TasfiqJ/checkpoint-runtime.git
cd checkpoint-runtime
docker compose up --build -d
```

- **Console:** [localhost:3000](http://localhost:3000)
- **Grafana:** [localhost:3001](http://localhost:3001) (admin/admin)
- **Jaeger:** [localhost:16686](http://localhost:16686)

## Key Features

- **Async checkpoint writes** with streaming gRPC, SHA256 integrity, and atomic commit
- **Automatic failure detection + recovery** via etcd leases and heartbeats
- **Backpressure control** with bounded queue depth to prevent OOM
- **Full observability** -- distributed traces (Jaeger), metrics (Prometheus), dashboards (Grafana)
- **Kubernetes-ready** with Helm chart, kind config, and headless service for DDP
- **Operator console** with live run status, checkpoint browser, and performance charts

## Failure Recovery

Kill a worker mid-checkpoint and the system recovers automatically:

```bash
docker kill ckpt-worker-0
# Logs: RUNNING -> FAILED -> RECOVERING -> RUNNING
# Training resumes from last committed checkpoint
```

## Performance

Found and fixed a **40% throughput bottleneck** in the checkpoint writer by pipelining SHA256 computation and streaming S3 multipart uploads. See [PERFORMANCE.md](PERFORMANCE.md) for flamegraphs and numbers.

| Metric | Before | After |
|--------|--------|-------|
| Write latency (p50) | 245 ms | 148 ms |
| Shard throughput | 48 MB/s | 78 MB/s |
| Recovery time | N/A | ~10s |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Data Plane | Rust, Tokio, Tonic (gRPC), AWS SDK |
| Control Plane | Python, FastAPI, aiohttp |
| Frontend | React 18, TypeScript, Tailwind CSS, Recharts |
| Coordination | etcd v3 (leases, watches, distributed locking) |
| Storage | MinIO (S3-compatible) |
| Observability | OpenTelemetry, Prometheus, Grafana, Jaeger |
| Deployment | Docker Compose, Helm, kind (K8s) |
| Training | PyTorch DDP (CPU, gloo backend) |
| Load Testing | k6 |
| Chaos Testing | Chaos Mesh |

## Kubernetes Deployment

```bash
kind create cluster --config deploy/kind/kind-config.yaml
helm install ckpt-rt deploy/helm/checkpoint-runtime
```

## Development

```bash
make build       # Build all components
make test        # Run all tests
make lint        # Lint all code
make up          # Start with Docker Compose
make down        # Stop everything
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for system design details.
