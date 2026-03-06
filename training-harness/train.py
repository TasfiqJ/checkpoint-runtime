"""
Training loop for checkpoint-runtime demonstration.

Trains a model for N steps with checkpoint saves every M steps.
Supports resuming from a previous checkpoint. Uses PyTorch DDP
with gloo backend for CPU-based distributed training.

When CONTROL_PLANE_URL is set, checkpoints are saved/loaded through
the runtime SDK (control plane + data plane). Otherwise falls back
to local disk (CKPT_LOCAL_MODE=1 or no control plane URL).

Usage:
    # Single-worker (local mode)
    python train.py --steps 1000 --checkpoint-every 100

    # Single-worker (runtime mode)
    CONTROL_PLANE_URL=http://localhost:8000 python train.py --steps 1000

    # DDP with 2 workers (via torchrun)
    torchrun --nproc_per_node=2 train.py --steps 1000 --checkpoint-every 100

    # Resume from checkpoint
    python train.py --steps 1000 --resume --checkpoint-dir /checkpoints
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import signal
import socket
import sys
import threading
import time
import uuid
from pathlib import Path

import torch
import torch.distributed as dist
import torch.nn as nn
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data import DataLoader, TensorDataset

from model import build_model, count_parameters

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
class RankFilter(logging.Filter):
    """Inject rank into every log record."""

    def __init__(self, rank: int = 0) -> None:
        super().__init__()
        self.rank = rank

    def filter(self, record: logging.LogRecord) -> bool:
        record.rank = str(self.rank)  # type: ignore[attr-defined]
        return True


# Set up logging with the rank field.  The RankFilter must be on the
# root *handler* (not root logger) so it injects %(rank)s into every
# log record regardless of which child logger originated it.
_rank_filter = RankFilter(0)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] rank=%(rank)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

for _h in logging.root.handlers:
    _h.addFilter(_rank_filter)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
_STOP_REQUESTED = False


def _signal_handler(sig: int, frame: object) -> None:
    global _STOP_REQUESTED
    _STOP_REQUESTED = True
    logger.warning("Stop signal received — will save checkpoint and exit")


signal.signal(signal.SIGINT, _signal_handler)
signal.signal(signal.SIGTERM, _signal_handler)

# Shared volume path for run_id coordination between workers
_SHARED_RUN_ID_PATH = Path("/shared/run_id")


# ---------------------------------------------------------------------------
# Runtime SDK client (lazy import)
# ---------------------------------------------------------------------------
def _get_runtime_client():
    """Create a RuntimeClient if CONTROL_PLANE_URL is set and not in local mode."""
    if os.environ.get("CKPT_LOCAL_MODE", "").strip() == "1":
        return None

    control_plane_url = os.environ.get("CONTROL_PLANE_URL", "").strip()
    if not control_plane_url:
        return None

    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "python-controlplane" / "src"))
        from sdk.client import RuntimeClient
        client = RuntimeClient(base_url=control_plane_url, timeout=120.0)
        logger.info("Connected to control plane at %s", control_plane_url)
        return client
    except Exception as exc:
        logger.warning("Could not connect to control plane: %s — falling back to local mode", exc)
        return None


def _get_or_create_run_id(runtime_client, rank: int, world_size: int) -> str:
    """Get an existing (resumable) RUN_ID or have rank-0 create a new run.

    On restart after a crash the shared volume still holds the old run_id.
    If that run exists and is in a resumable state we reuse it so the
    worker can restore from the last checkpoint.
    """
    run_id = os.environ.get("RUN_ID", "").strip()
    if run_id:
        return run_id

    if rank == 0:
        # Check shared volume for a previous run_id that can be resumed
        if _SHARED_RUN_ID_PATH.exists():
            old_run_id = _SHARED_RUN_ID_PATH.read_text().strip()
            if old_run_id:
                try:
                    run_info = runtime_client.get_run_status(old_run_id)
                    state = run_info.get("state", "")
                    if state in ("RUNNING", "COMMITTED", "CHECKPOINTING", "FAILED", "RECOVERING"):
                        # Resume the existing run — try to move it back to RUNNING
                        try:
                            runtime_client.resume(old_run_id)
                        except Exception:
                            pass  # already RUNNING or acceptable
                        logger.info("Resuming existing run: %s (was %s)", old_run_id, state)
                        return old_run_id
                except Exception:
                    pass  # run not found — create a new one

        # No resumable run found — create a new one
        run_info = runtime_client.start_run(
            name=f"training-{uuid.uuid4().hex[:8]}",
            num_workers=world_size,
        )
        run_id = run_info["run_id"]
        logger.info("Created new run: %s", run_id)

        # Write run_id to shared volume for other workers
        _SHARED_RUN_ID_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SHARED_RUN_ID_PATH.write_text(run_id)
        return run_id
    else:
        # Other ranks wait for rank-0 to write a *valid* run_id
        last_seen = ""
        for _ in range(60):  # wait up to 60 seconds
            if _SHARED_RUN_ID_PATH.exists():
                run_id = _SHARED_RUN_ID_PATH.read_text().strip()
                if run_id and run_id != last_seen:
                    last_seen = run_id
                    # Verify this run actually exists on the control plane
                    try:
                        runtime_client.get_run_status(run_id)
                        logger.info("Got run_id from rank-0: %s", run_id)
                        return run_id
                    except Exception:
                        pass  # stale id — keep waiting for rank-0 to update
            time.sleep(1)
        raise RuntimeError("Timed out waiting for run_id from rank-0")


# ---------------------------------------------------------------------------
# Heartbeat thread
# ---------------------------------------------------------------------------
class HeartbeatThread:
    """Background thread that sends periodic heartbeats to the control plane."""

    def __init__(self, runtime_client, worker_id: str, interval: float = 5.0):
        self._client = runtime_client
        self._worker_id = worker_id
        self._interval = interval
        self._step = 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self._thread.start()

    def update_step(self, step: int):
        self._step = step

    def stop(self):
        self._stop.set()
        self._thread.join(timeout=5)

    def _run(self):
        while not self._stop.is_set():
            try:
                self._client.heartbeat(self._worker_id, step=self._step)
            except Exception as exc:
                logger.warning("Heartbeat failed: %s", exc)
            self._stop.wait(self._interval)


# ---------------------------------------------------------------------------
# Checkpoint helpers — local disk
# ---------------------------------------------------------------------------
def save_checkpoint_local(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    step: int,
    loss: float,
    checkpoint_dir: Path,
    rank: int,
) -> Path:
    """Save a checkpoint to local disk. Returns the checkpoint path."""
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = checkpoint_dir / f"checkpoint_step{step}_rank{rank}.pt"

    state = {
        "step": step,
        "loss": loss,
        "model_state_dict": model.module.state_dict() if isinstance(model, DDP) else model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
    }

    torch.save(state, ckpt_path)
    logger.info("Checkpoint saved (local): %s (step=%d, loss=%.4f)", ckpt_path.name, step, loss)
    return ckpt_path


def load_checkpoint_local(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    checkpoint_dir: Path,
    rank: int,
) -> int:
    """Load the latest checkpoint from local disk. Returns the step to resume from."""
    import re
    pattern = f"checkpoint_step*_rank{rank}.pt"
    checkpoints = sorted(
        checkpoint_dir.glob(pattern),
        key=lambda p: int(re.search(r"step(\d+)", p.name).group(1)) if re.search(r"step(\d+)", p.name) else 0,
    )
    if not checkpoints:
        logger.info("No local checkpoints found in %s", checkpoint_dir)
        return 0

    latest = checkpoints[-1]
    state = torch.load(latest, map_location="cpu", weights_only=False)

    target = model.module if isinstance(model, DDP) else model
    target.load_state_dict(state["model_state_dict"])
    optimizer.load_state_dict(state["optimizer_state_dict"])

    step = state["step"]
    loss = state.get("loss", 0.0)
    logger.info("Resumed from local %s (step=%d, loss=%.4f)", latest.name, step, loss)
    return step


# ---------------------------------------------------------------------------
# Checkpoint helpers — runtime SDK (ACTUAL DATA TRANSFER)
# ---------------------------------------------------------------------------
def save_checkpoint_runtime(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    step: int,
    loss: float,
    rank: int,
    runtime_client,
    run_id: str,
) -> None:
    """Save a checkpoint through the runtime control plane.

    This actually sends the serialized tensor data to the data plane
    via the control plane REST API → gRPC → MinIO.
    """
    state = {
        "step": step,
        "loss": loss,
        "model_state_dict": model.module.state_dict() if isinstance(model, DDP) else model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
    }

    # Serialize state dict to bytes
    buffer = io.BytesIO()
    torch.save(state, buffer)
    shard_data = buffer.getvalue()

    try:
        t0 = time.time()

        # 1. Trigger checkpoint via control plane (RUNNING → CHECKPOINTING)
        cp_info = runtime_client.checkpoint(run_id, step=step)
        checkpoint_id = cp_info.get("checkpoint_id", "unknown")

        # 2. Upload the actual shard data to the data plane
        shard_id = f"rank-{rank}"
        upload_result = runtime_client.save_shard(
            run_id=run_id,
            checkpoint_id=checkpoint_id,
            shard_id=shard_id,
            data=shard_data,
            rank=rank,
        )

        # 3. Commit the checkpoint (CHECKPOINTING → COMMITTED → RUNNING)
        runtime_client.commit_checkpoint(run_id)

        elapsed = time.time() - t0
        logger.info(
            "Checkpoint saved (runtime): step=%d loss=%.4f size=%d bytes "
            "sha256=%s time=%.2fs",
            step, loss, len(shard_data),
            upload_result.get("sha256_checksum", "?")[:16],
            elapsed,
        )
    except Exception as exc:
        logger.error("Runtime checkpoint failed: %s", exc)
        # Attempt to resume the run to RUNNING so subsequent checkpoints can work
        try:
            runtime_client.resume(run_id)
            logger.info("Resumed run to RUNNING after checkpoint failure")
        except Exception:
            pass  # Best-effort; state may already be acceptable


def load_checkpoint_runtime(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    rank: int,
    runtime_client,
    run_id: str,
) -> int:
    """Load the latest checkpoint through the runtime control plane.

    This actually downloads the serialized tensor data from MinIO
    via the data plane → control plane REST API and restores the
    model and optimizer state.
    """
    try:
        # Get the latest committed checkpoint
        checkpoints = runtime_client.list_checkpoints(run_id)
        committed = [cp for cp in checkpoints if cp.get("state") == "COMMITTED"]
        if not committed:
            logger.info("No committed checkpoints found for run %s", run_id)
            return 0

        latest = committed[-1]
        checkpoint_id = latest.get("checkpoint_id", "")
        step = latest.get("step", 0)

        # Download the actual shard data from the data plane.
        # In our DDP setup only rank-0 saves checkpoints, so other ranks
        # fall back to loading rank-0's shard (same model state).
        t0 = time.time()
        shard_id = f"rank-{rank}"
        try:
            shard_bytes = runtime_client.load_shard(
                run_id=run_id,
                checkpoint_id=checkpoint_id,
                shard_id=shard_id,
            )
        except Exception:
            if rank != 0:
                logger.info("rank-%d shard not found, falling back to rank-0", rank)
                shard_bytes = runtime_client.load_shard(
                    run_id=run_id,
                    checkpoint_id=checkpoint_id,
                    shard_id="rank-0",
                )
            else:
                raise

        # Deserialize and restore model state
        buffer = io.BytesIO(shard_bytes)
        state = torch.load(buffer, map_location="cpu", weights_only=False)

        target = model.module if isinstance(model, DDP) else model
        target.load_state_dict(state["model_state_dict"])
        optimizer.load_state_dict(state["optimizer_state_dict"])

        elapsed = time.time() - t0
        logger.info(
            "Restored from runtime checkpoint: checkpoint_id=%s step=%d "
            "size=%d bytes time=%.2fs",
            checkpoint_id, step, len(shard_bytes), elapsed,
        )
        return step
    except Exception as exc:
        logger.warning("Runtime resume failed: %s — starting from step 0", exc)
        return 0


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------
def create_synthetic_dataset(
    num_samples: int = 1024,
    input_dim: int = 784,
    num_classes: int = 10,
    seed: int = 42,
) -> TensorDataset:
    """Create a synthetic dataset for training demonstration."""
    gen = torch.Generator().manual_seed(seed)
    X = torch.randn(num_samples, input_dim, generator=gen)
    y = torch.randint(0, num_classes, (num_samples,), generator=gen)
    return TensorDataset(X, y)


# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------
def train(args: argparse.Namespace) -> None:
    """Main training function."""
    # Setup distributed
    rank = int(os.environ.get("RANK", os.environ.get("WORKER_RANK", "0")))
    world_size = int(os.environ.get("WORLD_SIZE", "1"))
    local_rank = int(os.environ.get("LOCAL_RANK", "0"))
    is_distributed = world_size > 1

    # Override steps / checkpoint interval from env vars (Docker)
    if os.environ.get("NUM_STEPS"):
        args.steps = int(os.environ["NUM_STEPS"])
    if os.environ.get("CHECKPOINT_INTERVAL"):
        args.checkpoint_every = int(os.environ["CHECKPOINT_INTERVAL"])

    # Update the root-level rank filter so all loggers show the correct rank
    _rank_filter.rank = rank

    if is_distributed:
        os.environ.setdefault("RANK", str(rank))
        os.environ.setdefault("WORLD_SIZE", str(world_size))
        os.environ.setdefault("LOCAL_RANK", str(local_rank))
        dist.init_process_group(backend="gloo", rank=rank, world_size=world_size)
        logger.info("DDP initialized: rank=%d/%d", rank, world_size)

    # Build model
    model = build_model(
        model_type=args.model_type,
        input_dim=args.input_dim,
        hidden_dim=args.hidden_dim,
        output_dim=args.output_dim,
    )
    logger.info("Model: %s (%d parameters)", args.model_type, count_parameters(model))

    if is_distributed:
        model = DDP(model)

    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    criterion = nn.CrossEntropyLoss()

    # Data
    dataset = create_synthetic_dataset(
        num_samples=args.num_samples,
        input_dim=args.input_dim,
        num_classes=args.output_dim,
    )
    dataloader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, drop_last=True)

    # Initialize runtime client (if available)
    runtime_client = _get_runtime_client()
    heartbeat = None
    worker_id = None

    if runtime_client is not None:
        try:
            run_id = _get_or_create_run_id(runtime_client, rank, world_size)
        except Exception as exc:
            logger.warning("Failed to get/create run: %s — falling back to local mode", exc)
            runtime_client = None
            run_id = ""
    else:
        run_id = ""

    use_runtime = runtime_client is not None and bool(run_id)

    if use_runtime:
        logger.info("Using runtime SDK for checkpointing (run_id=%s)", run_id)

        # Register this worker with the control plane
        try:
            worker_info = runtime_client.register_worker(
                run_id=run_id,
                hostname=socket.gethostname(),
            )
            worker_id = worker_info["worker_id"]
            logger.info("Registered as worker %s", worker_id)

            # Start heartbeat thread
            heartbeat = HeartbeatThread(runtime_client, worker_id, interval=5.0)
            heartbeat.start()
        except Exception as exc:
            logger.warning("Worker registration failed: %s", exc)
    else:
        logger.info("Using local disk for checkpointing")

    # Resume from checkpoint (always try in runtime mode)
    checkpoint_dir = Path(args.checkpoint_dir)
    start_step = 0
    if args.resume or use_runtime:
        if use_runtime:
            start_step = load_checkpoint_runtime(model, optimizer, rank, runtime_client, run_id)
        else:
            start_step = load_checkpoint_local(model, optimizer, checkpoint_dir, rank)

    # Training loop
    model.train()
    step = start_step
    running_loss = 0.0
    t_start = time.time()

    while step < args.steps and not _STOP_REQUESTED:
        for batch_x, batch_y in dataloader:
            if step >= args.steps or _STOP_REQUESTED:
                break

            optimizer.zero_grad()
            output = model(batch_x)
            loss = criterion(output, batch_y)
            loss.backward()
            optimizer.step()

            step += 1
            running_loss += loss.item()

            # Update heartbeat with current step
            if heartbeat:
                heartbeat.update_step(step)

            if step % args.log_every == 0:
                avg_loss = running_loss / args.log_every
                elapsed = time.time() - t_start
                steps_per_sec = (step - start_step) / elapsed if elapsed > 0 else 0
                logger.info(
                    "step=%d/%d  loss=%.4f  steps/s=%.1f",
                    step, args.steps, avg_loss, steps_per_sec,
                )
                running_loss = 0.0

            # Checkpoint
            if args.checkpoint_every > 0 and step % args.checkpoint_every == 0:
                try:
                    if rank == 0 or not is_distributed:
                        if use_runtime:
                            save_checkpoint_runtime(
                                model, optimizer, step, loss.item(), rank,
                                runtime_client, run_id,
                            )
                        else:
                            save_checkpoint_local(model, optimizer, step, loss.item(), checkpoint_dir, rank)
                except Exception as exc:
                    logger.error("Checkpoint save failed (continuing training): %s", exc)
                finally:
                    if is_distributed:
                        dist.barrier()

    # Final checkpoint
    if rank == 0 or not is_distributed:
        if use_runtime:
            save_checkpoint_runtime(model, optimizer, step, running_loss, rank, runtime_client, run_id)
        else:
            save_checkpoint_local(model, optimizer, step, running_loss, checkpoint_dir, rank)

    elapsed = time.time() - t_start
    logger.info("Training complete: %d steps in %.1fs", step, elapsed)

    # Mark run as completed
    if use_runtime and rank == 0:
        try:
            runtime_client.complete_run(run_id)
            logger.info("Run %s marked as COMPLETED", run_id)
        except Exception as exc:
            logger.warning("Could not mark run as completed: %s", exc)

    # Cleanup
    if heartbeat:
        heartbeat.stop()
    if runtime_client:
        runtime_client.close()
    if is_distributed:
        dist.destroy_process_group()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Checkpoint Runtime Training Harness")
    parser.add_argument("--steps", type=int, default=1000)
    parser.add_argument("--checkpoint-every", type=int, default=100)
    parser.add_argument("--log-every", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--model-type", type=str, default="mlp", choices=["mlp", "resnet"])
    parser.add_argument("--input-dim", type=int, default=784)
    parser.add_argument("--hidden-dim", type=int, default=256)
    parser.add_argument("--output-dim", type=int, default=10)
    parser.add_argument("--num-samples", type=int, default=1024)
    parser.add_argument("--checkpoint-dir", type=str, default="/tmp/checkpoints")
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    train(parse_args())
