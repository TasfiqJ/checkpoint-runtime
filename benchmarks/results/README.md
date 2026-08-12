# Recorded k6 comparison

These artifacts are unedited k6 `--summary-export` JSON files from August 12, 2026.

## Environment

- Host: AMD Ryzen 7 5800X, 8 cores / 16 logical processors, 32 GiB RAM
- Docker Engine: 29.2.1, Linux containers
- k6 image: `grafana/k6@sha256:5221b620a4f874faff6e32ba597aa667c058391fe4898b1c6f6377f062c6cdec`
- Workload: the committed `tests/load/checkpoint_load_test.js`
- Checkpoint scenario: 4 constant VUs for 60 seconds; three 1 MiB checkpoint cycles per iteration
- Baseline source: `e999229cade9a56f56aa4eedfd7aeb515db97dfc`
- Optimized source: the multipart/checksum pipeline in the commit containing `optimized-k6-summary.json`

Both runs used `benchmarks/docker-compose.benchmark.yml` to isolate container names and ports from another active local stack. MinIO and etcd remained warm between runs. The optimized run was recorded first; the baseline was rebuilt from a detached `origin/main` worktree and recorded second.

## Raw artifacts

- `baseline-k6-summary.json`
- `optimized-k6-summary.json`

SHA-256 digests:

- `baseline-k6-summary.json`: `ef2385e39b2e8fd2a3884bfa99d03d6982cccb5cb5bb5f3e7dd269d40bebfd92`
- `optimized-k6-summary.json`: `34bf506a7b06e446b1f93da1dbd187792d4c7223e3bcbf7d5082fe461683c45b`

The command shape for each run was:

```text
docker run --rm --network checkpoint-runtime-benchmark_default \
  -e CONTROLPLANE_URL=http://python-controlplane:8000 \
  grafana/k6:latest run \
  --summary-trend-stats=avg,min,med,max,p(90),p(95),count \
  --summary-export=<artifact> \
  tests/load/checkpoint_load_test.js
```

## Direct comparison

`checkpoint_latency.count` is the number of completed checkpoint cycles recorded by the test. Because each cycle sends one 1 MiB payload and the scenario duration is 60 seconds, count / 60 gives both checkpoint cycles/s and application payload MiB/s.

| Metric | Baseline | Optimized | Change |
|---|---:|---:|---:|
| Completed checkpoint cycles | 198 | 192 | -3.03% |
| Checkpoint cycles/s | 3.30 | 3.20 | -3.03% |
| Application payload throughput | 3.30 MiB/s | 3.20 MiB/s | -3.03% |
| Checkpoint latency average | 74.11 ms | 88.59 ms | +19.54% |
| Checkpoint latency p95 | 137.45 ms | 149.60 ms | +8.84% |
| Failed checks | 0 | 0 | no change |
| Failed HTTP requests | 0 | 0 | no change |

The optimized path regressed this workload. These 1 MiB shards produce a single final multipart part, so the run measures multipart overhead but does not exercise overlap across multiple 5 MiB parts. The full k6 process exited nonzero in both matched runs because unrelated API/HTTP latency thresholds were crossed; all request checks and HTTP requests succeeded.

After the summaries were captured, the REST-to-gRPC chunk size was reduced from 4 MiB to 1 MiB because protobuf overhead made an exact 4 MiB payload exceed gRPC's default message limit. The benchmark payload itself is 1 MiB, so this correction does not alter the benchmark's chunking behavior. An 11 MiB end-to-end smoke upload subsequently succeeded and exercised two 5 MiB parts plus a 1 MiB final part.
