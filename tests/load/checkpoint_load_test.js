// k6 load test for checkpoint runtime.
// Tests: checkpoint throughput, API stress, backpressure validation.
// Run with: k6 run tests/load/checkpoint_load_test.js

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const checkpointLatency = new Trend("checkpoint_latency", true);
const apiLatency = new Trend("api_latency", true);

export const options = {
  scenarios: {
    // Scenario 1: API stress test
    api_stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 10 },
        { duration: "30s", target: 10 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "5s",
      exec: "apiStress",
    },
    // Scenario 2: Checkpoint throughput
    checkpoint_throughput: {
      executor: "constant-vus",
      vus: 4,
      duration: "60s",
      exec: "checkpointThroughput",
      startTime: "60s",
    },
    // Scenario 3: Backpressure validation
    backpressure: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 20 },
        { duration: "20s", target: 20 },
        { duration: "5s", target: 0 },
      ],
      exec: "backpressureTest",
      startTime: "130s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
    http_req_failed: ["rate<0.05"],
    errors: ["rate<0.1"],
    api_latency: ["p(95)<1000"],
    checkpoint_latency: ["p(95)<5000"],
  },
};

const BASE_URL = __ENV.CONTROLPLANE_URL || "http://localhost:8000";

// Scenario 1: API stress — hammer health, runs, workers endpoints
export function apiStress() {
  group("API Stress", () => {
    const healthRes = http.get(`${BASE_URL}/api/health`);
    check(healthRes, { "health 200": (r) => r.status === 200 }) || errorRate.add(1);
    apiLatency.add(healthRes.timings.duration);

    const runsRes = http.get(`${BASE_URL}/api/runs`);
    check(runsRes, { "runs 200": (r) => r.status === 200 }) || errorRate.add(1);
    apiLatency.add(runsRes.timings.duration);

    const workersRes = http.get(`${BASE_URL}/api/workers`);
    check(workersRes, { "workers 200": (r) => r.status === 200 }) || errorRate.add(1);
    apiLatency.add(workersRes.timings.duration);

    const metricsRes = http.get(`${BASE_URL}/api/metrics/summary`);
    check(metricsRes, { "metrics 200": (r) => r.status === 200 }) || errorRate.add(1);
    apiLatency.add(metricsRes.timings.duration);
  });

  sleep(0.5);
}

// Generate 1MB of random data for shard upload
const SHARD_SIZE = 1024 * 1024; // 1MB
function generateShardData() {
  // k6 doesn't have crypto.randomBytes, so we use a pre-built binary payload
  const bytes = new Uint8Array(SHARD_SIZE);
  for (let i = 0; i < SHARD_SIZE; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes.buffer;
}

const shardPayload = generateShardData();

// Scenario 2: Checkpoint throughput — full data flow with shard upload
export function checkpointThroughput() {
  group("Checkpoint Throughput (with data)", () => {
    // Create a run
    const createRes = http.post(
      `${BASE_URL}/api/runs`,
      JSON.stringify({
        name: `load-test-${__VU}-${Date.now()}`,
        num_workers: 1,
        checkpoint_interval_steps: 100,
      }),
      { headers: { "Content-Type": "application/json" } }
    );

    if (check(createRes, { "create run 201": (r) => r.status === 201 })) {
      const runId = createRes.json("run_id");
      if (!runId) return;

      // Start run
      const startRes = http.post(`${BASE_URL}/api/runs/${runId}/start`);
      check(startRes, { "start run 200": (r) => r.status === 200 });

      // Checkpoint cycle with actual shard data
      for (let i = 0; i < 3; i++) {
        const ckptStart = Date.now();

        // 1. Trigger checkpoint
        const ckptRes = http.post(`${BASE_URL}/api/runs/${runId}/checkpoint?step=${(i + 1) * 100}`);
        if (!check(ckptRes, { "checkpoint triggered": (r) => r.status === 200 })) {
          errorRate.add(1);
          break;
        }
        const checkpointId = ckptRes.json("checkpoint_id");

        // 2. Upload 1MB shard data
        const uploadRes = http.post(
          `${BASE_URL}/api/runs/${runId}/checkpoints/${checkpointId}/shards/rank-0`,
          shardPayload,
          {
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Shard-Rank": "0",
            },
            timeout: "60s",
          }
        );
        check(uploadRes, { "shard uploaded": (r) => r.status === 200 });

        // 3. Commit checkpoint
        const commitRes = http.post(`${BASE_URL}/api/runs/${runId}/commit`);
        check(commitRes, { "commit 200": (r) => r.status === 200 });

        const ckptDuration = Date.now() - ckptStart;
        checkpointLatency.add(ckptDuration);
        sleep(0.5);
      }

      // Complete run
      http.post(`${BASE_URL}/api/runs/${runId}/complete`);
    } else {
      errorRate.add(1);
    }
  });

  sleep(2);
}

// Scenario 3: Backpressure — flood with concurrent requests
export function backpressureTest() {
  group("Backpressure Validation", () => {
    const responses = http.batch([
      ["GET", `${BASE_URL}/api/health`],
      ["GET", `${BASE_URL}/api/runs`],
      ["GET", `${BASE_URL}/api/workers`],
      ["GET", `${BASE_URL}/api/health`],
      ["GET", `${BASE_URL}/api/metrics/summary`],
    ]);

    for (const res of responses) {
      check(res, {
        "backpressure: status < 500": (r) => r.status < 500,
      });
      if (res.status >= 500) {
        errorRate.add(1);
      }
    }
  });

  sleep(0.2);
}
