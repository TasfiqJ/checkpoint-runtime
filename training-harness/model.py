"""
Demonstration model for checkpoint-runtime training harness.

Provides a configurable MLP and a small ResNet-style model for testing
checkpoint save/restore across distributed workers.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class ResidualBlock(nn.Module):
    """Pre-activation residual block with optional down-projection."""

    def __init__(self, in_features: int, out_features: int) -> None:
        super().__init__()
        self.norm1 = nn.LayerNorm(in_features)
        self.linear1 = nn.Linear(in_features, out_features)
        self.norm2 = nn.LayerNorm(out_features)
        self.linear2 = nn.Linear(out_features, out_features)

        self.shortcut: nn.Module
        if in_features != out_features:
            self.shortcut = nn.Linear(in_features, out_features, bias=False)
        else:
            self.shortcut = nn.Identity()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        identity = self.shortcut(x)
        out = F.gelu(self.norm1(x))
        out = self.linear1(out)
        out = F.gelu(self.norm2(out))
        out = self.linear2(out)
        return out + identity


class DemoMLP(nn.Module):
    """Simple MLP for demonstration / integration testing.

    Args:
        input_dim:  Input feature dimension.
        hidden_dim: Hidden layer width.
        output_dim: Number of output classes.
        num_layers: Number of hidden layers.
        dropout:    Dropout probability.
    """

    def __init__(
        self,
        input_dim: int = 784,
        hidden_dim: int = 256,
        output_dim: int = 10,
        num_layers: int = 3,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()

        layers: list[nn.Module] = [nn.Linear(input_dim, hidden_dim), nn.ReLU(), nn.Dropout(dropout)]
        for _ in range(num_layers - 1):
            layers.extend([nn.Linear(hidden_dim, hidden_dim), nn.ReLU(), nn.Dropout(dropout)])
        layers.append(nn.Linear(hidden_dim, output_dim))

        self.network = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)


class DemoResNet(nn.Module):
    """Small ResNet-style model for testing checkpoint save/restore.

    Args:
        input_dim:   Input feature dimension.
        hidden_dim:  Hidden layer width.
        output_dim:  Number of output classes.
        num_blocks:  Number of residual blocks.
    """

    def __init__(
        self,
        input_dim: int = 784,
        hidden_dim: int = 256,
        output_dim: int = 10,
        num_blocks: int = 4,
    ) -> None:
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.blocks = nn.Sequential(*[ResidualBlock(hidden_dim, hidden_dim) for _ in range(num_blocks)])
        self.head = nn.Linear(hidden_dim, output_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_proj(x)
        x = self.blocks(x)
        return self.head(x)


def build_model(
    model_type: str = "mlp",
    input_dim: int = 784,
    hidden_dim: int = 256,
    output_dim: int = 10,
    **kwargs,
) -> nn.Module:
    """Factory function to build a model by type name."""
    if model_type == "mlp":
        return DemoMLP(input_dim, hidden_dim, output_dim, **kwargs)
    elif model_type == "resnet":
        return DemoResNet(input_dim, hidden_dim, output_dim, **kwargs)
    else:
        raise ValueError(f"Unknown model type: {model_type}")


def count_parameters(model: nn.Module) -> int:
    """Count total trainable parameters."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
