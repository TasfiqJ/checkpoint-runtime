"""Unit tests for the run lifecycle state machine."""

from __future__ import annotations

import pytest

from controlplane.models import RunState
from controlplane.state_machine import (
    VALID_TRANSITIONS,
    InvalidTransitionError,
    RunStateMachine,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ALL_STATES = list(RunState)
TERMINAL_STATES = {RunState.CANCELLED, RunState.COMPLETED}


# ---------------------------------------------------------------------------
# Initial state
# ---------------------------------------------------------------------------

class TestInitialState:
    def test_default_initial_state(self) -> None:
        sm = RunStateMachine()
        assert sm.state == RunState.CREATED

    def test_custom_initial_state(self) -> None:
        sm = RunStateMachine(initial_state=RunState.RUNNING)
        assert sm.state == RunState.RUNNING

    def test_empty_history_on_creation(self) -> None:
        sm = RunStateMachine()
        assert sm.history == []

    def test_not_terminal_on_creation(self) -> None:
        sm = RunStateMachine()
        assert sm.is_terminal is False


# ---------------------------------------------------------------------------
# Valid transitions
# ---------------------------------------------------------------------------

class TestValidTransitions:
    """Verify every transition listed in VALID_TRANSITIONS succeeds."""

    @pytest.mark.parametrize(
        "from_state, to_state",
        [
            (from_s, to_s)
            for from_s, targets in VALID_TRANSITIONS.items()
            for to_s in targets
        ],
    )
    def test_valid_transition(self, from_state: RunState, to_state: RunState) -> None:
        sm = RunStateMachine(initial_state=from_state)
        assert sm.can_transition(to_state) is True
        result = sm.transition(to_state)
        assert result == to_state
        assert sm.state == to_state

    def test_created_to_running(self) -> None:
        sm = RunStateMachine()
        sm.start()
        assert sm.state == RunState.RUNNING

    def test_created_to_cancelled(self) -> None:
        sm = RunStateMachine()
        sm.cancel()
        assert sm.state == RunState.CANCELLED
        assert sm.is_terminal is True

    def test_running_to_checkpointing(self) -> None:
        sm = RunStateMachine(initial_state=RunState.RUNNING)
        sm.begin_checkpoint()
        assert sm.state == RunState.CHECKPOINTING

    def test_checkpointing_to_committed(self) -> None:
        sm = RunStateMachine(initial_state=RunState.CHECKPOINTING)
        sm.commit_checkpoint()
        assert sm.state == RunState.COMMITTED

    def test_committed_to_running(self) -> None:
        sm = RunStateMachine(initial_state=RunState.COMMITTED)
        sm.resume()
        assert sm.state == RunState.RUNNING

    def test_committed_to_completed(self) -> None:
        sm = RunStateMachine(initial_state=RunState.COMMITTED)
        sm.complete()
        assert sm.state == RunState.COMPLETED
        assert sm.is_terminal is True

    def test_running_to_completed(self) -> None:
        sm = RunStateMachine(initial_state=RunState.RUNNING)
        sm.complete()
        assert sm.state == RunState.COMPLETED

    def test_running_to_failed(self) -> None:
        sm = RunStateMachine(initial_state=RunState.RUNNING)
        sm.fail()
        assert sm.state == RunState.FAILED

    def test_checkpointing_to_failed(self) -> None:
        sm = RunStateMachine(initial_state=RunState.CHECKPOINTING)
        sm.fail()
        assert sm.state == RunState.FAILED

    def test_failed_to_recovering(self) -> None:
        sm = RunStateMachine(initial_state=RunState.FAILED)
        sm.recover()
        assert sm.state == RunState.RECOVERING

    def test_recovering_to_running(self) -> None:
        sm = RunStateMachine(initial_state=RunState.RECOVERING)
        sm.start()
        assert sm.state == RunState.RUNNING

    def test_recovering_to_failed(self) -> None:
        sm = RunStateMachine(initial_state=RunState.RECOVERING)
        sm.fail()
        assert sm.state == RunState.FAILED

    def test_running_to_cancelled(self) -> None:
        sm = RunStateMachine(initial_state=RunState.RUNNING)
        sm.cancel()
        assert sm.state == RunState.CANCELLED


# ---------------------------------------------------------------------------
# Invalid transitions
# ---------------------------------------------------------------------------

class TestInvalidTransitions:
    """Verify that every disallowed transition raises InvalidTransitionError."""

    @pytest.mark.parametrize(
        "from_state, to_state",
        [
            (from_s, to_s)
            for from_s in ALL_STATES
            for to_s in ALL_STATES
            if to_s not in VALID_TRANSITIONS.get(from_s, set())
        ],
    )
    def test_invalid_transition_raises(
        self, from_state: RunState, to_state: RunState
    ) -> None:
        sm = RunStateMachine(initial_state=from_state)
        assert sm.can_transition(to_state) is False
        with pytest.raises(InvalidTransitionError) as exc_info:
            sm.transition(to_state)
        assert exc_info.value.current == from_state
        assert exc_info.value.target == to_state

    def test_cannot_go_from_completed(self) -> None:
        sm = RunStateMachine(initial_state=RunState.COMPLETED)
        assert sm.allowed_transitions() == set()
        for target in ALL_STATES:
            with pytest.raises(InvalidTransitionError):
                sm.transition(target)

    def test_cannot_go_from_cancelled(self) -> None:
        sm = RunStateMachine(initial_state=RunState.CANCELLED)
        assert sm.allowed_transitions() == set()
        for target in ALL_STATES:
            with pytest.raises(InvalidTransitionError):
                sm.transition(target)

    def test_created_cannot_skip_to_checkpointing(self) -> None:
        sm = RunStateMachine()
        with pytest.raises(InvalidTransitionError):
            sm.begin_checkpoint()

    def test_created_cannot_skip_to_committed(self) -> None:
        sm = RunStateMachine()
        with pytest.raises(InvalidTransitionError):
            sm.commit_checkpoint()

    def test_running_cannot_go_to_recovering(self) -> None:
        sm = RunStateMachine(initial_state=RunState.RUNNING)
        with pytest.raises(InvalidTransitionError):
            sm.recover()

    def test_checkpointing_cannot_go_to_running(self) -> None:
        sm = RunStateMachine(initial_state=RunState.CHECKPOINTING)
        with pytest.raises(InvalidTransitionError):
            sm.transition(RunState.RUNNING)

    def test_failed_cannot_go_to_completed(self) -> None:
        sm = RunStateMachine(initial_state=RunState.FAILED)
        with pytest.raises(InvalidTransitionError):
            sm.complete()


# ---------------------------------------------------------------------------
# History tracking
# ---------------------------------------------------------------------------

class TestHistory:
    def test_history_records_transitions(self) -> None:
        sm = RunStateMachine()
        sm.start()
        sm.begin_checkpoint()
        sm.commit_checkpoint()
        sm.resume()

        assert sm.history == [
            (RunState.CREATED, RunState.RUNNING),
            (RunState.RUNNING, RunState.CHECKPOINTING),
            (RunState.CHECKPOINTING, RunState.COMMITTED),
            (RunState.COMMITTED, RunState.RUNNING),
        ]

    def test_history_is_copy(self) -> None:
        sm = RunStateMachine()
        sm.start()
        history = sm.history
        history.clear()
        assert len(sm.history) == 1  # original unchanged

    def test_failed_transition_does_not_affect_history(self) -> None:
        sm = RunStateMachine()
        with pytest.raises(InvalidTransitionError):
            sm.complete()
        assert sm.history == []
        assert sm.state == RunState.CREATED


# ---------------------------------------------------------------------------
# Full lifecycle paths
# ---------------------------------------------------------------------------

class TestFullLifecycle:
    def test_happy_path(self) -> None:
        """CREATED -> RUNNING -> CHECKPOINTING -> COMMITTED -> COMPLETED."""
        sm = RunStateMachine()
        sm.start()
        sm.begin_checkpoint()
        sm.commit_checkpoint()
        sm.complete()
        assert sm.state == RunState.COMPLETED
        assert sm.is_terminal is True

    def test_checkpoint_loop(self) -> None:
        """Run through multiple checkpoint cycles before completing."""
        sm = RunStateMachine()
        sm.start()

        for _ in range(5):
            sm.begin_checkpoint()
            sm.commit_checkpoint()
            sm.resume()

        sm.complete()
        assert sm.state == RunState.COMPLETED
        # 1 start + 5*(checkpoint + commit + resume) + 1 complete = 17
        assert len(sm.history) == 17

    def test_failure_and_recovery(self) -> None:
        """CREATED -> RUNNING -> FAILED -> RECOVERING -> RUNNING -> COMPLETED."""
        sm = RunStateMachine()
        sm.start()
        sm.fail()
        sm.recover()
        sm.transition(RunState.RUNNING)
        sm.complete()
        assert sm.state == RunState.COMPLETED

    def test_checkpoint_failure_and_recovery(self) -> None:
        """RUNNING -> CHECKPOINTING -> FAILED -> RECOVERING -> RUNNING."""
        sm = RunStateMachine(initial_state=RunState.RUNNING)
        sm.begin_checkpoint()
        sm.fail()
        sm.recover()
        sm.transition(RunState.RUNNING)
        assert sm.state == RunState.RUNNING

    def test_cancel_during_run(self) -> None:
        """CREATED -> RUNNING -> CANCELLED."""
        sm = RunStateMachine()
        sm.start()
        sm.cancel()
        assert sm.state == RunState.CANCELLED
        assert sm.is_terminal is True


# ---------------------------------------------------------------------------
# Allowed transitions helper
# ---------------------------------------------------------------------------

class TestAllowedTransitions:
    def test_created_allowed(self) -> None:
        sm = RunStateMachine()
        assert sm.allowed_transitions() == {RunState.RUNNING, RunState.CANCELLED}

    def test_running_allowed(self) -> None:
        sm = RunStateMachine(initial_state=RunState.RUNNING)
        assert sm.allowed_transitions() == {
            RunState.CHECKPOINTING,
            RunState.FAILED,
            RunState.CANCELLED,
            RunState.COMPLETED,
        }

    def test_terminal_allowed_is_empty(self) -> None:
        for state in TERMINAL_STATES:
            sm = RunStateMachine(initial_state=state)
            assert sm.allowed_transitions() == set()


# ---------------------------------------------------------------------------
# Repr
# ---------------------------------------------------------------------------

class TestRepr:
    def test_repr_includes_state(self) -> None:
        sm = RunStateMachine()
        assert "CREATED" in repr(sm)
        sm.start()
        assert "RUNNING" in repr(sm)
