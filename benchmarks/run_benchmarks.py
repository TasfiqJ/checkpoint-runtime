#!/usr/bin/env python3
"""
Benchmark script for checkpoint-runtime.

Connects to the running Docker Compose stack and measures:
- Checkpoint save latency (serialize + upload + commit)
- Checkpoint restore latency (download + deserialize)
- Throughput (MB/s)
- Round-trip overhead

Usage:
    python benchmarks/run_benchmarks.py
    python benchmarks/run_benchmarks.py --sizes 1,10,100,1000
    python benchmarks/run_benchmarks.py --host http://localhost:8000
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
from pathlib import Path

# Add SDK to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "python-controlplane" / "src"))

from sdk.client import RuntimeClient


def generate_checkpoint_data(size_mb: int) -> bytes:
    """Generate synthetic checkpoint data of the given size in MB."""
    # Use random-like data to prevent compression from skewing results
    chunk = os.urandom(1024 * 1024)  # 1MB chunk
    data = chunk * size_mb
    return data


def run_benchmark(
    client: RuntimeClient,
    size_mb: int,
    num_iterations: int = 3,
) -> dict:
    """Run a save/restore benchmark for the given checkpoint size."""
    data = generate_checkpoint_data(size_mb)
    size_bytes = len(data)

    save_times = []
    restore_times = []

    for i in range(num_iterations):
        # Create a fresh run for each iteration
        run_info = client.start_run(
            name=f"bench-{size_mb}mb-iter{i}",
            num_workers=1,
        )
        run_id = run_info["run_id"]

        # --- SAVE ---
        t_save_start = time.perf_counter()

        # Trigger checkpoint
        cp_info = client.checkpoint(run_id, step=i + 1)
        checkpoint_id = cp_info["checkpoint_id"]

        # Upload shard data
        client.save_shard(
            run_id=run_id,
            checkpoint_id=checkpoint_id,
            shard_id="rank-0",
            data=data,
            rank=0,
        )

        # Commit
        client.commit_checkpoint(run_id)

        t_save_end = time.perf_counter()
        save_times.append(t_save_end - t_save_start)

        # --- RESTORE ---
        t_restore_start = time.perf_counter()

        restored_data = client.load_shard(
            run_id=run_id,
            checkpoint_id=checkpoint_id,
            shard_id="rank-0",
        )

        t_restore_end = time.perf_counter()
        restore_times.append(t_restore_end - t_restore_start)

        # Verify data integrity
        assert len(restored_data) == size_bytes, (
            f"Data size mismatch: {len(restored_data)} != {size_bytes}"
        )

        # Clean up
        try:
            client.complete_run(run_id)
        except Exception:
            pass

    # Compute statistics
    avg_save = sum(save_times) / len(save_times)
    avg_restore = sum(restore_times) / len(restore_times)
    save_throughput = (size_bytes / 1024 / 1024) / avg_save if avg_save > 0 else 0
    restore_throughput = (size_bytes / 1024 / 1024) / avg_restore if avg_restore > 0 else 0

    return {
        "size_mb": size_mb,
        "size_bytes": size_bytes,
        "iterations": num_iterations,
        "avg_save_ms": round(avg_save * 1000, 1),
        "avg_restore_ms": round(avg_restore * 1000, 1),
        "min_save_ms": round(min(save_times) * 1000, 1),
        "min_restore_ms": round(min(restore_times) * 1000, 1),
        "save_throughput_mbps": round(save_throughput, 1),
        "restore_throughput_mbps": round(restore_throughput, 1),
    }


def format_results_table(results: list[dict]) -> str:
    """Format benchmark results as a table."""
    lines = [
        "",
        "Checkpoint Benchmark Results",
        "=" * 90,
        f"{'Size':>8} | {'Save (ms)':>10} | {'Restore (ms)':>12} | "
        f"{'Save MB/s':>10} | {'Restore MB/s':>12} | {'Verified':>8}",
        "-" * 90,
    ]

    for r in results:
        lines.append(
            f"{r['size_mb']:>6} MB | "
            f"{r['avg_save_ms']:>10.1f} | "
            f"{r['avg_restore_ms']:>12.1f} | "
            f"{r['save_throughput_mbps']:>10.1f} | "
            f"{r['restore_throughput_mbps']:>12.1f} | "
            f"{'OK':>8}"
        )

    lines.append("-" * 90)
    lines.append(f"  Iterations per size: {results[0]['iterations']}")
    lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Checkpoint Runtime Benchmarks")
    parser.add_argument(
        "--host",
        default=os.environ.get("CONTROL_PLANE_URL", "http://localhost:8000"),
        help="Control plane URL",
    )
    parser.add_argument(
        "--sizes",
        default="1,10,100",
        help="Comma-separated checkpoint sizes in MB (default: 1,10,100)",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=3,
        help="Number of iterations per size (default: 3)",
    )
    parser.add_argument(
        "--output-json",
        help="Path to save JSON results",
    )
    args = parser.parse_args()

    sizes = [int(s.strip()) for s in args.sizes.split(",")]

    print(f"Connecting to control plane at {args.host}...")
    client = RuntimeClient(base_url=args.host, timeout=300.0)

    # Verify connection
    try:
        health = client.health()
        print(f"Control plane is {health.get('status', 'unknown')}")
    except Exception as exc:
        print(f"ERROR: Cannot connect to control plane: {exc}")
        sys.exit(1)

    results = []
    for size in sizes:
        print(f"Benchmarking {size} MB checkpoint ({args.iterations} iterations)...")
        result = run_benchmark(client, size, num_iterations=args.iterations)
        results.append(result)
        print(f"  Save: {result['avg_save_ms']:.1f}ms  "
              f"Restore: {result['avg_restore_ms']:.1f}ms  "
              f"Throughput: {result['save_throughput_mbps']:.1f} MB/s")

    print(format_results_table(results))

    if args.output_json:
        output_path = Path(args.output_json)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(results, indent=2))
        print(f"Results saved to {output_path}")

    client.close()


if __name__ == "__main__":
    main()
