#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# cleanup.sh — Periodic cleanup for the Checkpoint Runtime server
#
# Safe to run while the stack is live. Nothing restarts, no downtime.
#
# What it cleans:
#   1. Docker build cache (dangling layers from previous builds)
#   2. Old MinIO checkpoint data (keeps last N checkpoints per run)
#   3. Dangling Docker images
#
# Install as cron (runs daily at 4 AM):
#   crontab -e
#   0 4 * * * /opt/checkpoint-runtime/scripts/cleanup.sh >> /var/log/ckpt-cleanup.log 2>&1
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

KEEP_CHECKPOINTS=${KEEP_CHECKPOINTS:-30}   # keep last 30 checkpoints per run
MINIO_ALIAS="local"
MINIO_ENDPOINT="http://localhost:9000"
MINIO_ACCESS="minioadmin"
MINIO_SECRET="minioadmin"
BUCKET="checkpoints"

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
import boto3, os
from collections import defaultdict
from botocore.config import Config

s3 = boto3.client(
    's3',
    endpoint_url='http://minio:9000',
    aws_access_key_id='${MINIO_ACCESS}',
    aws_secret_access_key='${MINIO_SECRET}',
    config=Config(signature_version='s3v4'),
    region_name='us-east-1',
)

KEEP = ${KEEP_CHECKPOINTS}

# List all objects
paginator = s3.get_paginator('list_objects_v2')
all_objects = []
for page in paginator.paginate(Bucket='${BUCKET}'):
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

# Sort each run's checkpoints by time (newest first) and delete old ones
total_deleted = 0
total_bytes_freed = 0
for run_id, cps in runs.items():
    cps.sort(key=lambda x: x[1], reverse=True)
    to_delete = cps[KEEP:]
    for cp_id, _, objs in to_delete:
        for obj in objs:
            s3.delete_object(Bucket='${BUCKET}', Key=obj['Key'])
            total_deleted += 1
            total_bytes_freed += obj['Size']

print(f'Deleted {total_deleted} objects ({total_bytes_freed / 1024 / 1024:.1f} MB) from old checkpoints')
print(f'Kept last {KEEP} checkpoints per run across {len(runs)} run(s)')
" 2>&1
}

cleanup_minio_via_python
log "=== Cleanup complete ==="
