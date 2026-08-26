#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# cleanup.sh — Periodic cleanup for the Checkpoint Runtime server
#
# Safe to run while the stack is live. Nothing restarts, no downtime.
#
# What it cleans:
#   1. Docker build cache (dangling layers from previous builds)
#   2. Old MinIO checkpoint data (keeps active and recent runs)
#   3. Dangling Docker images
#
# Install as cron (runs daily at 4 AM):
#   crontab -e
#   0 4 * * * /opt/checkpoint-runtime/scripts/cleanup.sh >> /var/log/ckpt-cleanup.log 2>&1
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

KEEP_CHECKPOINTS=${KEEP_CHECKPOINTS:-30}   # keep last 30 checkpoints per run
KEEP_RUNS=${KEEP_RUNS:-5}                 # keep checkpoint data for last 5 runs
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "=== Checkpoint Runtime cleanup started ==="

# ── 1. Docker build cache ────────────────────────────────────────────
log "Pruning Docker build cache..."
BEFORE=$(docker system df --format '{{.Size}}' | head -1)
docker builder prune -f --filter "until=24h" 2>/dev/null || true
log "Docker build cache pruned (was: $BEFORE)"

# ── 2. Dangling images ──────────────────────────────────────────────
log "Removing dangling Docker images..."
docker image prune -f 2>/dev/null || true

# ── 3. MinIO checkpoint data ────────────────────────────────────────
# Uses mc (MinIO Client) if available, otherwise falls back to the
# controlplane's boto3 via a one-shot Python script inside Docker.

cleanup_minio_via_python() {
  log "Cleaning old MinIO checkpoints (keeping last $KEEP_CHECKPOINTS per run)..."
  docker exec ckpt-controlplane python3 -c "
import boto3, json, os, urllib.request
from collections import defaultdict
from botocore.config import Config

s3 = boto3.client(
    's3',
    endpoint_url=os.environ.get('S3_ENDPOINT', 'http://minio:9000'),
    aws_access_key_id=os.environ.get('S3_ACCESS_KEY', 'minioadmin'),
    aws_secret_access_key=os.environ.get('S3_SECRET_KEY', 'minioadmin'),
    config=Config(signature_version='s3v4'),
    region_name='us-east-1',
)

KEEP = ${KEEP_CHECKPOINTS}
KEEP_RUNS = ${KEEP_RUNS}
BUCKET = os.environ.get('S3_BUCKET', 'checkpoints')

# Fail closed if the active-run set cannot be read. Cleanup must never guess
# that a live recovery point is disposable.
with urllib.request.urlopen('http://localhost:8000/api/runs', timeout=10) as response:
    run_records = json.load(response)
active_states = {'RUNNING', 'CHECKPOINTING', 'COMMITTED', 'RECOVERING'}
active_run_ids = {
    run['run_id'] for run in run_records if run.get('state') in active_states
}
failed_runs = [run for run in run_records if run.get('state') == 'FAILED']
newest_failed_at = max(
    (run.get('updated_at', '') for run in failed_runs),
    default=None,
)
recoverable_failed_run_ids = {
    run['run_id']
    for run in failed_runs
    if run.get('updated_at', '') == newest_failed_at
}

# List all objects
paginator = s3.get_paginator('list_objects_v2')
all_objects = []
for page in paginator.paginate(Bucket=BUCKET):
    for obj in page.get('Contents', []):
        all_objects.append(obj)

# Group by run_id/checkpoint_id
checkpoints = defaultdict(list)  # run_id -> [(checkpoint_id, [objects], latest_modified)]
cp_objects = defaultdict(list)   # (run_id, checkpoint_id) -> [objects]

for obj in all_objects:
    parts = obj['Key'].split('/')
    if len(parts) >= 2:
        run_id, cp_id = parts[0], parts[1]
        cp_objects[(run_id, cp_id)].append(obj)

# Build checkpoint list per run with latest modified time
runs = defaultdict(list)
for (run_id, cp_id), objs in cp_objects.items():
    latest = max(o['LastModified'] for o in objs)
    runs[run_id].append((cp_id, latest, objs))

# Keep only the newest run prefixes, then keep the newest checkpoints inside
# those runs. This places a real upper bound on an always-on demo.
total_deleted = 0
total_bytes_freed = 0
ordered_runs = sorted(
    runs.items(),
    key=lambda item: max(cp[1] for cp in item[1]),
    reverse=True,
)
retained_run_ids = active_run_ids | recoverable_failed_run_ids | {
    run_id for run_id, _ in ordered_runs[:KEEP_RUNS]
}

for run_id, cps in ordered_runs:
    cps.sort(key=lambda x: x[1], reverse=True)
    to_delete = cps[KEEP:] if run_id in retained_run_ids else cps
    for cp_id, _, objs in to_delete:
        for obj in objs:
            s3.delete_object(Bucket=BUCKET, Key=obj['Key'])
            total_deleted += 1
            total_bytes_freed += obj['Size']

print(f'Deleted {total_deleted} objects ({total_bytes_freed / 1024 / 1024:.1f} MB) from old checkpoints')
print(f'Kept active runs plus up to {KEEP} checkpoints across the newest {KEEP_RUNS} run(s)')
" 2>&1
}

cleanup_minio_via_python
log "=== Cleanup complete ==="
