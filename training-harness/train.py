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
import sys
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
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] rank=%(rank)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


class RankFilter(logging.Filter):
    """Inject rank into every log record."""

    def __init__(self, rank: int = 0) -> None:
        super().__init__()
        self.rank = rank

    def filter(self, record: logging.LogRecord) -> bool:
        record.rank = str(self.rank)  # type: ignore[attr-defined]
        return True


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
        client = RuntimeClient(base_url=control_plane_url)
        logger.info("Connected to control plane at %s", control_plane_url)
        return client
    except Exception as exc:
        logger.warning("Could not connect to control plane: %s — falling back to local mode", exc)
        return None


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
    pattern = f"checkpoint_step*_rank{rank}.pt"
    checkpoints = sorted(checkpoint_dir.glob(pattern))
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
# Checkpoint helpers — runtime SDK
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
    """Save a checkpoint through the runtime control plane."""
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
        # Trigger checkpoint via control plane
        cp_info = runtime_client.checkpoint(run_id, step=step)
        logger.info(
            "Checkpoint triggered (runtime): checkpoint_id=%s step=%d size=%d bytes",
            cp_info.get("checkpoint_id", "?"), step, len(shard_data),
        )

        # Commit the checkpoint
        runtime_client.commit_checkpoint(run_id)
        logger.info("Checkpoint committed (runtime): step=%d, loss=%.4f", step, loss)
    except Exception as exc:
        logger.error("Runtime checkpoint failed: %s — state NOT saved", exc)


def load_checkpoint_runtime(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    rank: int,
    runtime_client,
    run_id: str,
) -> int:
    """Load the latest checkpoint through the runtime control plane."""
    try:
        # Resume the run (transitions FAILED/COMMITTED → RUNNING)
        runtime_client.resume(run_id)

        # Get the latest committed checkpoint
        checkpoints = runtime_client.list_checkpoints(run_id)
        committed = [cp for cp in checkpoints if cp.get("state") == "COMMITTED"]
        if not committed:
            logger.info("No committed checkpoints found for run %s", run_id)
            return 0

        latest = committed[-1]
        step = latest.get("step", 0)
        logger.info(
            "Resumed from runtime checkpoint: checkpoint_id=%s step=%d",
            latest.get("checkpoint_id", "?"), step,
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
    rank = int(os.environ.get("RANK", "0"))
    world_size = int(os.environ.get("WORLD_SIZE", "1"))
    local_rank = int(os.environ.get("LOCAL_RANK", "0"))
    is_distributed = world_size > 1

    logger.addFilter(RankFilter(rank))

    if is_distributed:
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
    run_id = os.environ.get("RUN_ID", "")
    use_runtime = runtime_client is not None and run_id

    if use_runtime:
        logger.info("Using runtime SDK for checkpointing (run_id=%s)", run_id)
    else:
        logger.info("Using local disk for checkpointing")

    # Resume
    checkpoint_dir = Path(args.checkpoint_dir)
    start_step = 0
    if args.resume:
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

            if step % args.log_every == 0:
                avg_loss = running_loss / args.log_every
                elapsed = time.time() - t_start
                steps_per_sec = step / elapsed if elapsed > 0 else 0
                logger.info(
                    "step=%d/%d  loss=%.4f  steps/s=%.1f",
                    step, args.steps, avg_loss, steps_per_sec,
                )
                running_loss = 0.0

            # Checkpoint
            if args.checkpoint_every > 0 and step % args.checkpoint_every == 0:
                if rank == 0 or not is_distributed:
                    if use_runtime:
                        save_checkpoint_runtime(
                            model, optimizer, step, loss.item(), rank,
                            runtime_client, run_id,
                        )
                    else:
                        save_checkpoint_local(model, optimizer, step, loss.item(), checkpoint_dir, rank)
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
