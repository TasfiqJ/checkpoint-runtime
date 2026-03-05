#!/usr/bin/env bash
# Record CPU profile of the Rust data plane during a checkpoint write.
# Usage: ./record_checkpoint_write.sh [duration_seconds]

set -euo pipefail

DURATION=${1:-30}
OUTPUT_DIR="$(dirname "$0")/../results"
mkdir -p "$OUTPUT_DIR"

PID=$(pgrep ckpt-dataplane || echo "")
if [ -z "$PID" ]; then
    echo "Error: ckpt-dataplane process not found"
    exit 1
fi

echo "Recording CPU profile of PID $PID for ${DURATION}s..."
perf record -F 99 -p "$PID" -g -- sleep "$DURATION"

echo "Generating flamegraph..."
perf script | stackcollapse-perf.pl | flamegraph.pl > "$OUTPUT_DIR/checkpoint_write.svg"

echo "Flamegraph saved to $OUTPUT_DIR/checkpoint_write.svg"

# Also capture syscall stats
echo ""
echo "Syscall analysis (10s sample):"
perf stat -e syscalls:sys_enter_write,syscalls:sys_enter_read -p "$PID" -- sleep 10
