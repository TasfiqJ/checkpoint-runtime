"""Demo training harness using the checkpoint-runtime SDK.

This script demonstrates a simple PyTorch training loop integrated
with the checkpoint runtime for asynchronous checkpointing.
"""

import os
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main():
    controlplane_url = os.environ.get("CONTROLPLANE_URL", "http://python-controlplane:8000")
    num_steps = int(os.environ.get("NUM_STEPS", "100"))
    checkpoint_interval = int(os.environ.get("CHECKPOINT_INTERVAL", "20"))

    logger.info(
        "Starting training harness (controlplane=%s, steps=%d, ckpt_interval=%d)",
        controlplane_url,
        num_steps,
        checkpoint_interval,
    )

    # Placeholder: will integrate with SDK in Phase 2
    for step in range(num_steps):
        # Simulate training step
        loss = 1.0 / (step + 1)

        if step % 10 == 0:
            logger.info("Step %d/%d — loss=%.4f", step, num_steps, loss)

        if step > 0 and step % checkpoint_interval == 0:
            logger.info("Checkpoint triggered at step %d (placeholder)", step)

    logger.info("Training complete after %d steps", num_steps)


if __name__ == "__main__":
    main()
