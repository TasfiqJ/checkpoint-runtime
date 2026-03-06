#!/bin/bash
# Load test runner for checkpoint-runtime.
# Runs k6 with increasing concurrency and collects results.
#
# Usage: ./benchmarks/run_load_test.sh
# Requires: k6 (https://k6.io/docs/get-started/installation/)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RESULTS_DIR="$PROJECT_DIR/benchmarks/results"

mkdir -p "$RESULTS_DIR"

echo "============================================"
echo "Checkpoint Runtime Load Test"
echo "============================================"
echo ""

# Run the checkpoint throughput scenario with different VU counts
for VUS in 2 4 8 16; do
    echo "Running with $VUS concurrent checkpoint writers..."
    k6 run \
        --vus "$VUS" \
        --duration 60s \
        --out "json=$RESULTS_DIR/load_test_${VUS}vus.json" \
        -e CONTROLPLANE_URL="${CONTROLPLANE_URL:-http://localhost:8000}" \
        "$PROJECT_DIR/tests/load/checkpoint_load_test.js" \
        2>&1 | tee "$RESULTS_DIR/load_test_${VUS}vus.log"
    echo ""
done

echo "============================================"
echo "Load test complete. Results in: $RESULTS_DIR"
echo "============================================"
