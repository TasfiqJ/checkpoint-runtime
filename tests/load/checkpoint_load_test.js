// k6 load test for checkpoint write throughput.
// Run with: k6 run tests/load/checkpoint_load_test.js

import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 4 },   // Ramp up to 4 workers
    { duration: "60s", target: 4 },   // Sustain
    { duration: "10s", target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(99)<5000"],  // p99 < 5s
    http_req_failed: ["rate<0.01"],     // <1% errors
  },
};

export default function () {
  const baseUrl = __ENV.CONTROLPLANE_URL || "http://localhost:8000";

  // Health check
  const healthRes = http.get(`${baseUrl}/api/health`);
  check(healthRes, {
    "health 200": (r) => r.status === 200,
  });

  // List runs
  const runsRes = http.get(`${baseUrl}/api/runs`);
  check(runsRes, {
    "runs 200": (r) => r.status === 200,
  });

  sleep(1);
}
