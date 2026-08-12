# Shard-size k6 matrix — August 12, 2026

This directory contains the unedited k6 `--summary-export` JSON for an A/B comparison of the buffered and streaming Rust writers at 1, 16, 64, and 256 MiB.

## Recovery measurement

A separate recovery measurement ran 10 process-kill trials. The worst observed recovery was 9.689 seconds. Roughly 6 seconds of that window is a deliberate `RECOVERING` hold. Restarting the failed process is the orchestrator's responsibility; the runtime detects the failure and coordinates recovery once a replacement process is available.

## Method

- Buffered writer: Rust data-plane source from `e999229cade9a56f56aa4eedfd7aeb515db97dfc`.
- Streaming writer: Rust data-plane source from `804a1fc6c57c5e528d524b14b8888404aa4c107e`.
- Shared control plane: the `804a1fc` control plane, including 1 MiB REST-to-gRPC chunks, for both writer variants. This isolates the writer implementation and avoids gRPC's default 4 MiB message limit.
- Load: four constant k6 VUs for 60 seconds, checkpoint scenario only.
- Each run used one requested shard size. A 16-byte header changed before every upload so content-addressed deduplication could not turn repeated writes into no-ops.
- The isolated `checkpoints` bucket and control-plane process were reset before every run.
- Runs were paired by size in this order: buffered, then streaming.
- Throughput is the raw k6 `checkpoint_bytes.rate / 1,048,576`, so graceful-stop time for in-flight uploads is included.
- p95 is the raw k6 `checkpoint_latency.p(95)`, covering trigger, upload, and commit.

## Results

| Shard size | Buffered throughput | Streaming throughput | Streaming change | Buffered p95 | Streaming p95 | Streaming p95 change |
|---:|---:|---:|---:|---:|---:|---:|
| 1 MiB | 3.223 MiB/s | 3.177 MiB/s | -1.42% | 101.70 ms | 131.60 ms | +29.40% |
| 16 MiB | 47.093 MiB/s | 43.508 MiB/s | -7.61% | 294.65 ms | 516.60 ms | +75.33% |
| 64 MiB | 123.785 MiB/s | 111.762 MiB/s | -9.71% | 1,338.25 ms | 1,538.70 ms | +14.98% |
| 256 MiB | 179.038 MiB/s | 137.025 MiB/s | -23.47% | 7,137.20 ms | 7,581.50 ms | +6.23% |

There is no crossover in the tested range. The streaming implementation never exceeded buffered throughput and never produced a lower p95. All eight runs had zero failed checks and a zero HTTP request failure rate. Both 256 MiB runs exited k6 with status 99 because their p95 exceeded the existing `p(95)<5000` threshold; their requests and checkpoints still succeeded and their JSON summaries are valid.

The current streaming design writes multipart data to a staging object, then performs a server-side copy and deletes the staging object after the content-addressed key becomes known. That extra promotion work is a likely contributor to the result. The control plane also reads the complete HTTP request body before emitting gRPC chunks, so this benchmark does not provide end-to-end HTTP ingress streaming.

## Artifact hashes

| Artifact | SHA-256 |
|---|---|
| `buffered-1mib-k6-summary.json` | `1686ec99a359eab000be040f6cd36e641fae927e64d75d838cb715fbd0359e70` |
| `streaming-1mib-k6-summary.json` | `fa8eb2729f3631114ef84dcd223b5037421e4dbfe8dbf0231605e408b9ebed23` |
| `buffered-16mib-k6-summary.json` | `3f7a32b0598a06aade9910295de263097ece678fa66e883504e80a5dd13170a9` |
| `streaming-16mib-k6-summary.json` | `996174256166e70557537328650c3ac8a9cbd879b83f61fe65698bf8af4dfa7f` |
| `buffered-64mib-k6-summary.json` | `286edc325fb2c88974880cb7b170a0f071c687b92e9d7c594331a56a136cb83d` |
| `streaming-64mib-k6-summary.json` | `6c3c3bd0f888f0aebfb8a5c68dcf4b443a41bae778138b367b3cef74d1a1db72` |
| `buffered-256mib-k6-summary.json` | `4777a14e22b3ddae75a64a7ab69c053beada9f27a412769a3d413cfd4e823208` |
| `streaming-256mib-k6-summary.json` | `c6d58701d8f411aff05e9f7f830aa8fccee326c9992b1f4cb16af9f85a106044` |
