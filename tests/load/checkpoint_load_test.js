// k6 load test for checkpoint runtime.
// Tests: checkpoint throughput, API stress, backpressure validation.
// Run with: k6 run tests/load/checkpoint_load_test.js

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const checkpointLatency = new Trend("checkpoint_latency", true);
const checkpointBytes = new Counter("checkpoint_bytes");
const checkpointSuccesses = new Counter("checkpoint_successes");
const apiLatency = new Trend("api_latency", true);

const CHECKPOINT_ONLY = (__ENV.CHECKPOINT_ONLY || "false").toLowerCase() === "true";
const CHECKPOINT_DURATION = __ENV.CHECKPOINT_DURATION || "60s";

const checkpointScenario = {
  executor: "constant-vus",
  vus: 4,
  duration: CHECKPOINT_DURATION,
  exec: "checkpointThroughput",
  startTime: CHECKPOINT_ONLY ? "0s" : "60s",
  gracefulStop: "5m",
};

export const options = {
  scenarios: CHECKPOINT_ONLY ? {
    checkpoint_throughput: checkpointScenario,
  } : {
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
    checkpoint_throughput: checkpointScenario,
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

// Generate a reusable payload at the requested size. A small header is changed
// before every upload so content-addressed deduplication cannot turn later
// checkpoint writes into no-ops.
const SHARD_SIZE_MIB = Number.parseInt(__ENV.SHARD_SIZE_MIB || "1", 10);
if (![1, 16, 64, 256].includes(SHARD_SIZE_MIB)) {
  throw new Error(`Unsupported SHARD_SIZE_MIB=${SHARD_SIZE_MIB}`);
}
const SHARD_SIZE = SHARD_SIZE_MIB * 1024 * 1024;
function generateShardData() {
  const bytes = new Uint8Array(SHARD_SIZE);
  // Non-zero repeating content prevents special handling of sparse zero data.
  for (let i = 0; i < bytes.length; i += 4096) bytes[i] = (i / 4096) & 0xff;
  return bytes.buffer;
}

const shardPayload = generateShardData();

function makePayloadUnique(checkpointIndex) {
  const header = new Uint32Array(shardPayload, 0, 4);
  header[0] = __VU;
  header[1] = __ITER;
  header[2] = checkpointIndex;
  header[3] = Date.now() >>> 0;
}

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

        // 2. Upload shard data
        makePayloadUnique(i);
        const uploadRes = http.post(
          `${BASE_URL}/api/runs/${runId}/checkpoints/${checkpointId}/shards/rank-0`,
          shardPayload,
          {
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Shard-Rank": "0",
            },
            timeout: "5m",
          }
        );
        if (!check(uploadRes, { "shard uploaded": (r) => r.status === 200 })) {
          errorRate.add(1);
          break;
        }

        // 3. Commit checkpoint
        const commitRes = http.post(`${BASE_URL}/api/runs/${runId}/commit`);
        if (!check(commitRes, { "commit 200": (r) => r.status === 200 })) {
          errorRate.add(1);
          break;
        }

        const ckptDuration = Date.now() - ckptStart;
        checkpointLatency.add(ckptDuration);
        checkpointBytes.add(SHARD_SIZE);
        checkpointSuccesses.add(1);
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
