"""Simple model for demonstration purposes.

This is a minimal MLP used to demonstrate the checkpoint runtime.
The model is intentionally simple — the focus is on the infrastructure.
"""

import logging

logger = logging.getLogger(__name__)


class SimpleMLP:
    """Placeholder model class. Will be replaced with PyTorch nn.Module in Phase 2."""

    def __init__(self, input_dim: int = 784, hidden_dim: int = 256, output_dim: int = 10):
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim
        logger.info(
            "SimpleMLP initialized (input=%d, hidden=%d, output=%d)",
            input_dim,
            hidden_dim,
            output_dim,
        )

    def state_dict(self) -> dict:
        """Return a placeholder state dict."""
        return {
            "input_dim": self.input_dim,
            "hidden_dim": self.hidden_dim,
            "output_dim": self.output_dim,
        }

    def load_state_dict(self, state: dict) -> None:
        """Load a placeholder state dict."""
        self.input_dim = state.get("input_dim", self.input_dim)
        self.hidden_dim = state.get("hidden_dim", self.hidden_dim)
        self.output_dim = state.get("output_dim", self.output_dim)
