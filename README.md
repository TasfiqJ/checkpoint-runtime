# Checkpoint Runtime

![CI](https://github.com/TasfiqJ/checkpoint-runtime/actions/workflows/ci.yml/badge.svg)
![Integration](https://github.com/TasfiqJ/checkpoint-runtime/actions/workflows/integration.yml/badge.svg)

**Browser Simulation:** https://ckpt.tasfiqj.com/demo

The public site no longer depends on the paid Hetzner backend, which is being retired.
The simulation runs entirely in the browser. To exercise the real workers, storage,
failure detection, and recovery path, run the Docker stack locally.

A fault-tolerant distributed checkpoint runtime for machine learning
training.\
It saves model progress during training so that if a machine crashes,
the job can restart from the last checkpoint instead of losing hours or
days of work.

The system streams checkpoint data through a **Rust data plane** into
**S3-compatible storage**, while a **Python control plane** coordinates
workers, detects failures, and handles recovery.

------------------------------------------------------------------------

# Why This Exists

When training large models across multiple machines, failures are
normal.\
A worker might crash because of memory pressure, network issues, or
hardware problems. Without checkpointing, all progress stored in RAM
disappears and training must restart from step 0.

This system solves that by **saving the model state during training**.
If a worker crashes, the system restores the most recent checkpoint and
resumes training from that step instead of starting over.

------------------------------------------------------------------------

# Architecture

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

### Control Plane (Python / FastAPI)

Handles orchestration and system state.

Responsibilities:

-   tracks workers using heartbeat leases in etcd\
-   manages the training run state machine\
-   coordinates checkpoint creation\
-   detects failures and triggers recovery\
-   exposes REST APIs and event streams

### Data Plane (Rust / gRPC)

Handles the heavy I/O work.

Responsibilities:

-   receives checkpoint data streams\
-   computes SHA-256 integrity hashes\
-   uploads shard data to MinIO (S3-compatible storage)\
-   retries failed uploads\
-   manages backpressure for high throughput workloads

Splitting these layers lets Python handle orchestration while Rust
handles high-performance data transfer.

------------------------------------------------------------------------

# How Checkpoints Work

During training:

1.  The worker serializes the model state (weights and optimizer).
2.  The worker tells the control plane to start a checkpoint.
3.  The checkpoint data is streamed to the Rust data plane.
4.  The data plane writes the shard to MinIO with a SHA256 hash.
5.  A manifest file is written to mark the checkpoint as complete.

If the manifest exists, the checkpoint is valid. If not, the checkpoint
is discarded.

------------------------------------------------------------------------

# Failure Recovery

If a worker crashes:

1.  Heartbeats stop.
2.  etcd lease expires.
3.  Control plane marks the run as FAILED.
4.  Docker restarts the worker container.
5.  The worker loads the most recent committed checkpoint.
6.  Training resumes from the saved step.

Recovery typically completes in under **30 seconds**.

------------------------------------------------------------------------

# Quick Start

Clone the repository and start the full stack.

``` bash
git clone https://github.com/TasfiqJ/checkpoint-runtime.git
cd checkpoint-runtime
docker compose up --build -d
```

All services will start automatically.

  Service         Port                     Description
  --------------- ------------------------ ---------------------
  Frontend        http://localhost:3000    Operator dashboard
  Control Plane   http://localhost:8000    REST API
  MinIO Console   http://localhost:9001    Object storage UI
  Grafana         http://localhost:3001    Metrics dashboards
  Jaeger          http://localhost:16686   Distributed tracing
  Prometheus      http://localhost:9091    Metrics

------------------------------------------------------------------------

# Browser Simulation and Local Runtime

Open the browser-only simulation:

https://ckpt.tasfiqj.com/demo

It demonstrates the user-visible sequence without contacting a backend:

1.  Start a simulated training run\
2.  Watch simulated checkpoints appear\
3.  Stop a simulated worker\
4.  Watch the browser model failure, checkpoint restore, and resumed training

For real execution, follow the local Docker instructions above. Once the local stack
has at least two checkpoints, trigger its coordinated failure test with:

```bash
curl -X POST http://localhost:8000/api/demo/kill-worker/ckpt-worker-0
```

On Windows PowerShell, use:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/demo/kill-worker/ckpt-worker-0
```

------------------------------------------------------------------------

# Key Features

-   Distributed checkpoint pipeline
-   Streaming gRPC uploads
-   SHA256 content integrity verification
-   Automatic worker failure detection
-   Automatic training recovery
-   Atomic checkpoint commits
-   Backpressure protection for uploads
-   Observability with traces, metrics, and dashboards
-   Interactive demo UI for testing failures

------------------------------------------------------------------------

# Running Benchmarks

``` bash
python benchmarks/run_benchmarks.py --sizes 1,10,100
```

For load testing:

``` bash
./benchmarks/run_load_test.sh
```

------------------------------------------------------------------------

# Tech Stack

  Component       Technology
  --------------- --------------------------------------------
  Data Plane      Rust, Tokio, Tonic gRPC
  Control Plane   Python, FastAPI
  Frontend        React, TypeScript, Tailwind
  Training        PyTorch DDP
  Coordination    etcd
  Storage         MinIO (S3 compatible)
  Observability   OpenTelemetry, Prometheus, Grafana, Jaeger
  Deployment      Docker Compose

------------------------------------------------------------------------

# Development

``` bash
make build
make test
make lint
make up
make down
```

------------------------------------------------------------------------

# Project Structure

    checkpoint-runtime/
    ├── rust-dataplane
    ├── python-controlplane
    ├── training-harness
    ├── frontend
    ├── proto
    ├── observability
    ├── benchmarks
    ├── tests
    └── docker-compose.yml
