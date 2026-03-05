"""
Training loop for checkpoint-runtime demonstration.

Trains a model for N steps with checkpoint saves every M steps.
Supports resuming from a previous checkpoint. Uses PyTorch DDP
with gloo backend for CPU-based distributed training.

Usage:
    # Single-worker
    python train.py --steps 1000 --checkpoint-every 100

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
# Checkpoint helpers
# ---------------------------------------------------------------------------
def save_checkpoint(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    step: int,
    loss: float,
    checkpoint_dir: Path,
    rank: int,
) -> Path:
    """Save a checkpoint to disk. Returns the checkpoint path."""
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = checkpoint_dir / f"checkpoint_step{step}_rank{rank}.pt"

    state = {
        "step": step,
        "loss": loss,
        "model_state_dict": model.module.state_dict() if isinstance(model, DDP) else model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
    }

    torch.save(state, ckpt_path)
    logger.info("Checkpoint saved: %s (step=%d, loss=%.4f)", ckpt_path.name, step, loss)
    return ckpt_path


def load_checkpoint(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    checkpoint_dir: Path,
    rank: int,
) -> int:
    """Load the latest checkpoint. Returns the step to resume from."""
    pattern = f"checkpoint_step*_rank{rank}.pt"
    checkpoints = sorted(checkpoint_dir.glob(pattern))
    if not checkpoints:
        logger.info("No checkpoints found in %s", checkpoint_dir)
        return 0

    latest = checkpoints[-1]
    state = torch.load(latest, map_location="cpu", weights_only=False)

    target = model.module if isinstance(model, DDP) else model
    target.load_state_dict(state["model_state_dict"])
    optimizer.load_state_dict(state["optimizer_state_dict"])

    step = state["step"]
    loss = state.get("loss", 0.0)
    logger.info("Resumed from %s (step=%d, loss=%.4f)", latest.name, step, loss)
    return step


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

    # Resume
    checkpoint_dir = Path(args.checkpoint_dir)
    start_step = 0
    if args.resume:
        start_step = load_checkpoint(model, optimizer, checkpoint_dir, rank)

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
                    save_checkpoint(model, optimizer, step, loss.item(), checkpoint_dir, rank)
                if is_distributed:
                    dist.barrier()

    # Final checkpoint
    if rank == 0 or not is_distributed:
        save_checkpoint(model, optimizer, step, running_loss, checkpoint_dir, rank)

    elapsed = time.time() - t_start
    logger.info("Training complete: %d steps in %.1fs", step, elapsed)

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
