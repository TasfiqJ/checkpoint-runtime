# Architecture

## System Overview

Checkpoint Runtime is a distributed system for managing training checkpoints in large-scale ML training pipelines. It separates the high-throughput data path (Rust) from the coordination logic (Python) to maximize both performance and development velocity.

## Component Architecture

```
+---------------------------------------------------------------------+
|                        Operator Console                              |
|  React 18 + TypeScript + Tailwind CSS + Recharts                    |
|  Pages: Runs | Run Detail | Checkpoints | Health | Performance      |
|  Real-time: SSE event stream, 5s polling                            |
|  Port: 3000 (Nginx reverse proxy -> Control Plane API)              |
+-----------------------------------+---------------------------------+
                                    | HTTP REST
+-----------------------------------v---------------------------------+
|                        Control Plane                                 |
|  Python 3.11 + FastAPI + aiohttp                                    |
|                                                                      |
|  +--------------+  +--------------+  +--------------------------+   |
|  | REST API     |  | State Machine|  | Coordinator (etcd)       |   |
|  | /api/runs    |  | 8-state FSM  |  | Key-value, leases,      |   |
|  | /api/workers |  | CREATED ->   |  | watches, distributed    |   |
|  | /api/health  |  | RUNNING ->   |  | locking via v3 HTTP API |   |
|  | SSE events   |  | CHECKPOINTING|  +--------------------------+   |
|  +--------------+  | -> COMMITTED |  +--------------------------+   |
|                    | <-> FAILED ->|  | Worker Manager           |   |
|  +--------------+  | RECOVERING   |  | Registration, rank       |   |
|  | gRPC Client  |  +--------------+  | assignment, run tracking |   |
|  | -> Data Plane|                    +--------------------------+   |
|  +--------------+  +--------------+  +--------------------------+   |
|                    | Heartbeat Mgr|  | Recovery Manager         |   |
|                    | etcd leases  |  | Checkpoint rollback,     |   |
|                    | TTL=10s      |  | worker re-assignment     |   |
|                    +--------------+  +--------------------------+   |
|  Port: 8000 (REST) | 50052 (gRPC)                                   |
+----------+--------------------------------------------------+------+
           | gRPC (streaming)                                  | HTTP (etcd v3)
+----------v--------------------------+           +------------v---------+
|       Data Plane                    |           |         etcd         |
|  Rust + Tokio + Tonic               |           |  v3.5.12             |
|                                     |           |  Consensus, leases,  |
|  +---------------------------+      |           |  watches             |
|  | CheckpointService         |      |           |  Port: 2379          |
|  | WriteShard (stream)       |      |           +----------------------+
|  | ReadShard (stream)        |      |
|  | CommitCheckpoint          |      |
|  | AbortCheckpoint           |      |
|  | GetShardStatus            |      |
|  | HealthCheck               |      |
|  +-------------+-------------+      |
|                |                    |
|  +-------------v-------------+      |
|  | Storage Layer (S3)        |      |
|  | put_object, get_object    |      |
|  | SHA256 checksums          |      |
|  | Manifest management       |      |
|  +-------------+-------------+      |
|                |                    |
|  +-------------+-------------+      |
|  | Backpressure Control      |      |
|  | Queue depth tracking      |      |
|  | Max concurrent uploads    |      |
|  +---------------------------+      |
|                                     |
|  Metrics: Prometheus (:9090)        |
|  Traces: OpenTelemetry              |
|  Port: 50051 (gRPC)                |
+--------------+----------------------+
               | S3 API
+--------------v----------------------+
|          MinIO                      |
|  S3-compatible storage              |
|  Bucket: checkpoints                |
|  Layout:                            |
|    {run_id}/                        |
|      {ckpt_id}/                     |
|        {shard_id}.bin               |
|        {shard_id}.sha256            |
|        _manifest.json               |
|  Port: 9000 (API)                   |
|  Port: 9001 (Console)               |
+-------------------------------------+
```

## Data Flow

### Checkpoint Write Path

```
Worker -> SDK.checkpoint()
  -> Control Plane: POST /api/runs/{id}/checkpoint
    -> State: RUNNING -> CHECKPOINTING
  -> SDK streams shard data via gRPC WriteShard
    -> Data Plane receives ShardChunk stream
    -> SHA256 computed in parallel (pipelined)
    -> Chunks streamed to S3 multipart upload
    -> Checksum sidecar written
  -> SDK.commit()
    -> Control Plane: POST /api/runs/{id}/commit
      -> Data Plane: CommitCheckpoint (writes _manifest.json)
      -> State: CHECKPOINTING -> COMMITTED -> RUNNING
```

### Failure Recovery Path

```
Worker heartbeat stops (etcd lease expires)
  -> HeartbeatManager detects failure
  -> RecoveryManager triggered
    -> State: RUNNING/CHECKPOINTING -> FAILED
    -> If mid-checkpoint: AbortCheckpoint (GC incomplete shards)
    -> Identify last COMMITTED checkpoint from etcd
    -> State: FAILED -> RECOVERING
    -> Surviving workers notified
    -> Workers call SDK.resume()
      -> ReadShard streams checkpoint data back
    -> State: RECOVERING -> RUNNING
    -> Training continues from last checkpoint
```

## Run State Machine

```
                    +-----------+
          +-------->|  CREATED  |<------ initial state
          |         +-----+-----+
          |               | start
          |         +-----v-----+
          |    +--->|  RUNNING  |<------------------+
          |    |    +--+--+--+--+                   |
          |    |       |  |  |                      |
          |    |  ckpt |  |  | complete        resume
          |    |       |  |  |                      |
          |    |  +----v--+  |         +------------+
          |    |  |CHECKING  |         |            |
          |    |  |POINTING  |         |       +----+------+
          |    |  +----+-----+         |       |RECOVERING |
          |    |       |               |       +-----^-----+
          |    |  commit               |             |
          |    |       |               |          recover
          |    |  +----v-----+         |             |
          |    +--+COMMITTED |         |       +-----+-----+
          |       +----------+         |       |  FAILED   |
          |                            |       +-----------+
     cancel                            |
          |       +----------+         |
          +------>|CANCELLED |         |
                  +----------+    +----v-----+
                                  |COMPLETED |
                                  +----------+
```

Valid transitions: CREATED->RUNNING, RUNNING->CHECKPOINTING, CHECKPOINTING->COMMITTED, COMMITTED->RUNNING, RUNNING->COMPLETED, COMMITTED->COMPLETED, RUNNING->FAILED, CHECKPOINTING->FAILED, FAILED->RECOVERING, RECOVERING->RUNNING, CREATED->CANCELLED, RUNNING->CANCELLED.

## Observability Stack

```
+-----------+    +-----------+    +-----------+
| Data Plane|    |Control    |    | Training  |
|  (Rust)   |    |Plane (Py) |    | Workers   |
+-----+-----+    +-----+-----+    +-----+-----+
      | OTLP           | OTLP          |
      +--------+-------+               |
               v                       |
        +--------------+               |
        | OTel Collector|<--------------+
        |  :4317 (gRPC) |
        +--+---------+--+
           |         |
    traces |         | metrics
           v         v
     +----------+  +----------+
     |  Jaeger  |  |Prometheus|
     |  :16686  |  |  :9091   |
     +----------+  +----+-----+
                        |
                   +----v-----+
                   | Grafana  |
                   |  :3001   |
                   | Dashboards:
                   | - Checkpoint Overview
                   | - Cluster Health
                   +----------+
```

## Kubernetes Deployment

```
kind cluster: 1 control-plane + 3 worker nodes

Helm chart (deploy/helm/checkpoint-runtime/):
  +-- etcd StatefulSet (1 replica, 2Gi PVC)
  +-- minio StatefulSet (1 replica, 10Gi PVC)
  +-- rust-dataplane Deployment (2 replicas)
  +-- python-controlplane Deployment (1 replica)
  +-- frontend Deployment (1 replica, NodePort 30000)
  +-- training Job (parallelism: 2, headless service)
  +-- otel-collector Deployment
  +-- prometheus Deployment + ConfigMap
  +-- grafana Deployment + ConfigMap (NodePort 30001)
  +-- jaeger Deployment (NodePort 30002)
  +-- ServiceAccount

Workers discover each other via K8s DNS:
  training-workers (headless service) -> DDP init via MASTER_ADDR
```

## Storage Layout

```
MinIO bucket: checkpoints/
  +-- {run_id}/
      +-- {checkpoint_id}/
          +-- shard-0.bin        # Raw shard data
          +-- shard-0.sha256     # SHA256 checksum
          +-- shard-1.bin
          +-- shard-1.sha256
          +-- _manifest.json     # Checkpoint metadata
                                 # {checkpoint_id, run_id, step,
                                 #  created_at, num_shards,
                                 #  total_bytes, shards: [...]}
```

## Directory Structure

```
checkpoint-runtime/
+-- rust-dataplane/          # Rust data plane (Tokio + Tonic)
+-- python-controlplane/     # Python control plane (FastAPI)
+-- frontend/                # React operator console
+-- training-harness/        # Example PyTorch DDP training
+-- proto/                   # Protocol Buffer definitions
+-- deploy/
|   +-- helm/                # Helm chart for K8s
|   +-- kind/                # kind cluster config
|   +-- terraform/           # AWS infrastructure
+-- observability/           # Prometheus, Grafana, OTel configs
+-- profiling/               # perf scripts and flamegraph tools
+-- tests/
|   +-- e2e/                 # End-to-end integration tests
|   +-- load/                # k6 load test scripts
|   +-- chaos/               # Chaos Mesh experiments
+-- docker-compose.yml       # Local dev stack
+-- Makefile                 # Build/test/lint commands
+-- PERFORMANCE.md           # Profiling report with flamegraphs
+-- ARCHITECTURE.md          # This file
```
