# Checkpoint Runtime

![CI](https://github.com/TasfiqJ/checkpoint-runtime/actions/workflows/ci.yml/badge.svg)
![Integration](https://github.com/TasfiqJ/checkpoint-runtime/actions/workflows/integration.yml/badge.svg)

A fault-tolerant, high-throughput distributed checkpoint runtime for ML training. Streams checkpoint data through a Rust data plane to S3-compatible storage, with automatic failure detection and recovery.

## Architecture

```
                         +---------------------+
                         |   Operator Console   |
                         |  React + Tailwind    |
                         |   localhost:3000     |
                         +---------+-----------+
                                   | REST + SSE
                         +---------v-----------+
                         |   Control Plane      |
                         |  Python / FastAPI    |
                         |  FSM + Recovery      |
                         |   localhost:8000     |
                         +--+----+--------+----+
                     gRPC   |    |        |  etcd v3
                            |    |        |  (state, leases)
              +-------------v-+  |  +-----v-------+
              |   Data Plane   |  |  |    etcd      |
              |  Rust / Tonic  |  |  |   :2379      |
              |  Streaming I/O |  |  +-------------+
              |   :50051       |  |
              +------+---------+  |
                     | S3 API     |
              +------v---------+  |
              |     MinIO      |  |
              |  S3-compatible |  |
              |   :9000        |  |
              +----------------+  |
                                  |
    +--------------+  +-----------+--+
    |  Worker 0    |  |  Worker 1    |
    |  PyTorch DDP |  |  PyTorch DDP |
    |  + SDK       |  |  + SDK       |
    +--------------+  +--------------+

  Observability: Prometheus (:9091) -> Grafana (:3001)
                 OTel Collector -> Jaeger (:16686)
```

**Data flow:** Worker serializes model state → SDK uploads shard bytes → Control plane streams to Data plane via gRPC → Data plane writes to MinIO with SHA256 integrity → Manifest committed atomically.

## Quick Start

```bash
git clone https://github.com/TasfiqJ/checkpoint-runtime.git
cd checkpoint-runtime
docker compose up --build -d
```

All 11 services start automatically:

| Service | Port | Description |
|---------|------|-------------|
| Frontend | [localhost:3000](http://localhost:3000) | Operator console with live demo |
| Control Plane | [localhost:8000](http://localhost:8000) | REST API + SSE events |
| Data Plane | localhost:50051 | gRPC streaming checkpoint I/O |
| MinIO Console | [localhost:9001](http://localhost:9001) | S3 object browser (minioadmin/minioadmin) |
| Grafana | [localhost:3001](http://localhost:3001) | Dashboards (admin/admin) |
| Jaeger | [localhost:16686](http://localhost:16686) | Distributed traces |
| Prometheus | [localhost:9091](http://localhost:9091) | Metrics |

## Live Demo: Failure Recovery

Open the **Live Demo** page at [localhost:3000/demo](http://localhost:3000/demo) and follow these steps:

### 1. Start Demo
Click "Start Demo" to connect to the running training workers. Workers automatically create a run, register with the control plane, and begin training with periodic checkpoints.

### 2. Watch Checkpoints
Every 50 training steps, workers serialize their model state (model weights + optimizer state), upload the tensor data through the data plane to MinIO, and commit an atomic checkpoint. You'll see checkpoint events appear in the timeline with sizes and timing.

### 3. Kill a Worker
Click "Kill" on any worker. This sends `docker kill` to the container, simulating a node failure. The control plane detects the missed heartbeats within **15 seconds**.

### 4. Watch Recovery
The system automatically:
1. Detects the failure via heartbeat timeout (15s)
2. Transitions the run: RUNNING → FAILED → RECOVERING → RUNNING
3. Docker restarts the worker container (`restart: unless-stopped`)
4. Worker loads the last committed checkpoint from MinIO
5. Training resumes from the exact step where the checkpoint was saved

**The entire recovery cycle completes in under 30 seconds.**

### Manual verification:

```bash
# Kill a worker
docker kill ckpt-worker-0

# Watch control plane detect the failure
docker logs -f ckpt-controlplane
# → "Worker XXX declared DEAD (15.0s since last heartbeat)"
# → "Run XXX transitioned to FAILED"
# → "Run XXX recovered successfully and is now RUNNING"

# Watch the worker restart and load checkpoint
docker logs -f ckpt-worker-0
# → "Restored from runtime checkpoint: step=50 size=1234567 bytes"

# Verify checkpoint data exists in MinIO
docker exec ckpt-minio mc ls local/checkpoints/ --recursive
```

## Key Features

- **End-to-end data flow** — actual tensor bytes flow through the entire pipeline (Worker → SDK → REST → gRPC → S3)
- **Streaming gRPC uploads** with SHA256 integrity and content-addressed deduplication
- **Automatic failure detection** via heartbeat monitoring (configurable 15s threshold)
- **Automatic recovery** — workers restart and load the last committed checkpoint
- **Atomic commit** — checkpoint manifests are committed atomically, partial writes are cleaned up
- **Backpressure control** with bounded queue depth to prevent OOM
- **Full observability** — distributed traces (Jaeger), metrics (Prometheus), dashboards (Grafana)
- **Live demo page** with one-click failure injection and recovery visualization

## Running Benchmarks

```bash
# Start the stack
docker compose up --build -d

# Run checkpoint benchmarks (1MB, 10MB, 100MB)
python benchmarks/run_benchmarks.py --sizes 1,10,100

# Run load tests (requires k6: https://k6.io)
./benchmarks/run_load_test.sh
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Data Plane | Rust, Tokio, Tonic (gRPC), AWS SDK for Rust |
| Control Plane | Python 3.11, FastAPI, grpcio |
| Frontend | React 18, TypeScript, Tailwind CSS, Recharts |
| SDK | Python httpx client with binary shard transfer |
| Coordination | etcd v3 (state management, leases) |
| Storage | MinIO (S3-compatible object storage) |
| Observability | OpenTelemetry, Prometheus, Grafana, Jaeger |
| Training | PyTorch DDP (CPU, gloo backend) |
| Deployment | Docker Compose (11 services) |
| Load Testing | k6 with actual data upload scenarios |

## Development

```bash
make build       # Build all components
make test        # Run all tests
make lint        # Lint all code
make up          # Start with Docker Compose
make down        # Stop everything
```

## Project Structure

```
checkpoint-runtime/
├── rust-dataplane/          # Rust gRPC data plane (streaming writes, reads, manifests)
├── python-controlplane/     # Python control plane (FastAPI, state machine, recovery)
│   └── src/
│       ├── controlplane/    # Core: coordinator, heartbeat, recovery, state machine
│       │   └── api/         # REST endpoints + gRPC client to data plane
│       └── sdk/             # RuntimeClient SDK used by training workers
├── training-harness/        # PyTorch DDP training loop with checkpoint integration
├── frontend/                # React operator console with live demo page
├── proto/                   # Protocol Buffer definitions (gRPC service)
├── observability/           # Prometheus, Grafana, OTEL collector configs
├── benchmarks/              # Benchmark and load test scripts
├── tests/                   # Unit, integration, and E2E tests
└── docker-compose.yml       # Full stack orchestration (11 services)
```
