"""End-to-end test: full checkpoint lifecycle.

This test requires the full Docker Compose stack running.
Run with: pytest tests/e2e/ -v
"""

import pytest


@pytest.mark.skip(reason="Requires full stack — Phase 2+")
def test_full_checkpoint_cycle():
    """Start run → train N steps → checkpoint → verify in MinIO."""
    pass


@pytest.mark.skip(reason="Requires full stack — Phase 3+")
def test_failure_recovery():
    """Start run → checkpoint → kill worker → resume → verify state."""
    pass
