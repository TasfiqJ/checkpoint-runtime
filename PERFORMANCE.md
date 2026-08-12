# Performance Report

## Overview

This document records a performance design and its validation status. The figures historically shown below were planning projections, not measured results. The repository contains no raw baseline run, no raw pre-optimization k6 summary, and no reproducible evidence for the previously stated 63% throughput increase or 45% p95 latency reduction.

The proposed test host was a Ryzen 7 5800X (8C/16T) with 32 GB DDR4 and NVMe SSD running the full Docker Compose stack. That description is not a recorded baseline run.

## Methodology

The intended methodology was:

1. Baseline profiling using Linux `perf` inside the data plane container with `--privileged` mode
2. Flamegraph generation using [flamegraph.pl](https://github.com/brendangregg/FlameGraph)
3. Load testing using k6 with 4 concurrent checkpoint writers over 60 seconds
4. A before/after comparison using identical workload and environment settings

No baseline command output, k6 JSON summary, environment manifest, or perf data was committed when the original figures were added. Consequently, the historical comparison cannot be reproduced from repository artifacts.

### Profiling Setup

```bash
# Start stack with profiling enabled
docker compose up -d

# Record CPU profile (30s sample)
./profiling/perf-scripts/record_checkpoint_write.sh 30

# Run k6 load test during profiling
k6 run tests/load/checkpoint_load_test.js
```

## Unrecorded Baseline Assumptions

The following values appeared in the original report, but no baseline run is recorded. They must be treated as assumptions used to illustrate the proposed design, not observations.

### Throughput

| Metric | Value |
|--------|-------|
| Checkpoint writes/min | 12.4 |
| Avg write latency (p50) | 245 ms |
| Avg write latency (p95) | 1,120 ms |
| Avg write latency (p99) | 2,340 ms |
| Shard write throughput | 48 MB/s |
| S3 upload throughput | 42 MB/s |

### Illustrative Baseline Flamegraph

The original report assigned the following percentages. No `perf.data`, folded stack file, or command output is present to substantiate them, so this is an illustrative profile rather than a measured flamegraph:

```
100% [total]
 |-- 34% tokio::runtime::worker -- async task scheduling
 |-- 28% checkpoint::writer::write_shard
 |   |-- 18% sha2::Sha256::update -- SHA256 checksum computation
 |   +-- 10% bytes::BytesMut::extend_from_slice -- buffer copies
 |-- 22% aws_sdk_s3::client::put_object -- S3 upload
 |   |-- 14% hyper::client -- HTTP framing
 |   +--  8% rustls::tls -- TLS handshake (not applicable for MinIO)
 |-- 11% tonic::codec -- gRPC serialization/deserialization
 +--  5% other (metrics, tracing, GC)
```

**Illustrative SVG:** `profiling/results/checkpoint_write_baseline.svg`. The SVG is not a substitute for the missing raw profile.

## Bottleneck Analysis

### Bottleneck 1: Sequential Checksum Computation

Code inspection showed that SHA256 was computed synchronously. The former 18% CPU attribution was a projection and was not measured by a recorded run.

### Bottleneck 2: Contiguous Buffer Copy

Code inspection showed that each chunk was copied into a growing contiguous buffer before upload. The former 10% CPU attribution was not measured by a recorded run.

### Bottleneck 3: Non-pipelined S3 Upload

Code inspection showed that S3 upload waited until all chunks were received. The former 22% CPU attribution was not measured by a recorded run.

## Proposed Optimized Path

The design below was originally presented as implemented even though the corresponding code was absent. It is a proposed design until implementation and new benchmark artifacts are reviewed independently. Its performance figures remain projections regardless of implementation status.

### Fix 1: Pipelined Checksum Computation

**Change:** Moved SHA256 computation to a separate `tokio::spawn_blocking` task that processes chunks from a bounded channel. The gRPC receiver sends chunks to both the checksum task and the S3 upload pipeline concurrently.

```
Before: receive chunk -> sha256.update() -> buffer.extend() -> [wait for all] -> S3 upload
After:  receive chunk -> channel.send() -> sha256 task (parallel)
                      -> S3 multipart upload (streaming)
```

**Projected impact (unmeasured):** SHA256 overhead from 18% to 6% of total CPU time.

### Fix 2: Zero-Copy Buffer Management

**Change:** Replaced `BytesMut::extend_from_slice` with a `Vec<Bytes>` chunk list. Instead of copying each chunk into a contiguous buffer, chunks are kept as a list of `Bytes` references and streamed directly to S3 multipart upload as individual parts.

**Projected impact (unmeasured):** buffer-copy overhead from 10% to 2% of total CPU time.

### Fix 3: Streaming S3 Multipart Upload

**Change:** Switched from buffered single-part upload to S3 multipart upload. Each chunk (or batch of chunks reaching 5MB) is uploaded as a separate part while more chunks are still arriving. The S3 upload starts as soon as the first chunk batch is ready.

**Projected impact (unmeasured):** approximately 40% lower upload latency for shards larger than 10 MB.

## Historical Projections — Not Measured Results

These are the original report's projected before/after values. They are retained for provenance, not as benchmark results. In particular, `(78 - 48) / 48 = 62.5%` was rounded to 63%, and `(1120 - 620) / 1120 = 44.6%` was rounded to 45%; neither percentage came from committed baseline and optimized runs.

### Throughput

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Checkpoint writes/min | 12.4 | 18.6 | **+50%** |
| Avg write latency (p50) | 245 ms | 148 ms | **-40%** |
| Avg write latency (p95) | 1,120 ms | 620 ms | **-45%** |
| Avg write latency (p99) | 2,340 ms | 1,180 ms | **-50%** |
| Shard write throughput | 48 MB/s | 78 MB/s | **+63%** |
| S3 upload throughput | 42 MB/s | 72 MB/s | **+71%** |

### Illustrative Optimized Flamegraph

```
100% [total]
 |-- 38% tokio::runtime::worker -- async task scheduling
 |-- 14% checkpoint::writer::write_shard
 |   |--  6% sha2::Sha256::update -- pipelined checksum
 |   +--  2% buffer management -- zero-copy chunks
 |-- 28% aws_sdk_s3::client -- S3 multipart upload
 |   |-- 20% hyper::client -- HTTP streaming
 |   +--  8% connection management
 |-- 12% tonic::codec -- gRPC framing
 +--  8% other (metrics, tracing, backpressure)
```

**Illustrative SVG:** `profiling/results/checkpoint_write_optimized.svg`. No raw optimized profile accompanies it.

## Unverified Historical Load-Test Output

The text below was previously labeled as a k6 result, but no matching raw k6 summary was committed. It is retained only to make the documentation correction explicit and must not be cited as a measured result.

### k6 Summary (4 VUs, 60s sustained)

```
scenarios: (100.00%) 3 scenarios, 30 max VUs, 3m35s max duration

     checks.........................: 99.2%  1847 / 1862
     data_received..................: 2.1 MB 12 kB/s
     data_sent......................: 456 kB 2.6 kB/s
     http_req_duration..............: avg=89ms  min=2ms  med=34ms  max=4.2s  p(95)=412ms  p(99)=1.8s
     api_latency....................: avg=28ms  min=2ms  med=18ms  max=890ms p(95)=124ms
     checkpoint_latency.............: avg=148ms min=32ms med=112ms max=2.1s  p(95)=620ms
     errors.........................: 0.81%  15 / 1847
```

## Unverified Historical Chaos-Test Claims

No raw chaos-test logs or result artifacts accompany these tables. They are not validated performance measurements.

### Worker Kill Mid-Checkpoint

| Event | Timestamp | Result |
|-------|-----------|--------|
| Training worker killed | T+0s | Pod terminated |
| Control plane detects failure | T+3s | Heartbeat timeout |
| Run transitions to FAILED | T+3s | State machine transition |
| Recovery initiated | T+4s | Last committed checkpoint identified |
| Run transitions to RECOVERING | T+4s | Surviving workers notified |
| Workers resume from checkpoint | T+8s | Checkpoint data restored |
| Run transitions to RUNNING | T+10s | Training continues |
| **Total recovery time** | **10s** | Clean recovery |

### Network Latency Injection (500ms to MinIO)

| Metric | Normal | With Latency | Impact |
|--------|--------|--------------|--------|
| Write latency (p50) | 148 ms | 680 ms | +360% |
| Write latency (p95) | 620 ms | 2,100 ms | +239% |
| Error rate | 0.8% | 3.2% | +300% |
| Backpressure triggered | No | Yes | Queue depth hit limit |
| Recovery after latency removed | Immediate | N/A | Backpressure drained |

### Data Plane Pod Kill

| Event | Result |
|-------|--------|
| Data plane pod killed | K8s restarts pod (RestartPolicy) |
| In-flight writes | Retried by client (exponential backoff) |
| Recovery time | ~5s (pod restart + health check) |
| Data loss | None (incomplete writes cleaned by GC) |

## Conclusions

The original 63% throughput and 45% p95 latency claims were projections presented as measurements. Because no baseline run was recorded, they cannot be verified. Only results backed by committed raw artifacts from comparable pre-change and post-change builds should be reported as measured performance.

## Recorded Implementation Comparison (August 12, 2026)

The proposed path was implemented with a bounded gRPC-to-writer channel, a `spawn_blocking` SHA-256 worker fed by a second bounded channel, bounded five-MiB multipart batches, and `Vec<Bytes>` chunk storage rather than a full-shard contiguous allocation. Because the final object key contains the digest, multipart data is streamed to a temporary key and promoted to the content-addressed key after hashing completes.

The committed raw summaries are in `benchmarks/results/`. Both use the repository's unchanged k6 workload: four constant checkpoint VUs for 60 seconds and 1 MiB payloads. Throughput below is `checkpoint_latency.count / 60`; since each completed cycle carries 1 MiB, the numeric value is also application payload MiB/s.

| Metric | Recorded baseline | Recorded optimized | Actual change |
|---|---:|---:|---:|
| Completed checkpoint cycles | 198 | 192 | -3.03% |
| Checkpoint throughput | 3.30 cycles/s | 3.20 cycles/s | -3.03% |
| Application payload throughput | 3.30 MiB/s | 3.20 MiB/s | -3.03% |
| Checkpoint latency average | 74.11 ms | 88.59 ms | +19.54% |
| Checkpoint latency p95 | 137.45 ms | 149.60 ms | +8.84% |
| Failed checks / failed HTTP requests | 0 / 0 | 0 / 0 | no change |

This workload shows a regression, not the historical projected improvement. A 1 MiB shard is smaller than the five-MiB multipart batch size, so it exercises a single final multipart part plus staging-object promotion. It does not measure the intended overlap for larger multi-part shards. The k6 process exited nonzero for both matched runs because unrelated API/HTTP latency thresholds were crossed, although every check passed and no HTTP request failed.
