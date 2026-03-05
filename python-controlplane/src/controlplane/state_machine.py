"""Run lifecycle finite state machine.

Defines the valid state transitions for a run and enforces them at runtime.

State diagram:

    CREATED --> RUNNING --> CHECKPOINTING --> COMMITTED --> RUNNING (loop)
                  |              |                           |
                  |              v                           v
                  +--------> FAILED <-----------+       COMPLETED
                  |              |               |
                  |              v               |
                  |         RECOVERING ----------+
                  |
                  +--------> CANCELLED

Additional transitions:
    COMMITTED --> COMPLETED  (run finishes after commit)
    RECOVERING --> RUNNING   (successful recovery)
    CREATED --> CANCELLED    (cancel before start)
    CHECKPOINTING --> FAILED (checkpoint failure)
    RUNNING --> COMPLETED    (run finishes without final checkpoint)
"""

from __future__ import annotations

from controlplane.models import RunState


class InvalidTransitionError(Exception):
    """Raised when an invalid state transition is attempted."""

    def __init__(self, current: RunState, target: RunState) -> None:
        self.current = current
        self.target = target
        super().__init__(
            f"Invalid state transition: {current.value} -> {target.value}"
        )


# Map of current state -> set of valid next states.
VALID_TRANSITIONS: dict[RunState, set[RunState]] = {
    RunState.CREATED: {
        RunState.RUNNING,
        RunState.CANCELLED,
    },
    RunState.RUNNING: {
        RunState.CHECKPOINTING,
        RunState.FAILED,
        RunState.CANCELLED,
        RunState.COMPLETED,
    },
    RunState.CHECKPOINTING: {
        RunState.COMMITTED,
        RunState.FAILED,
    },
    RunState.COMMITTED: {
        RunState.RUNNING,
        RunState.COMPLETED,
    },
    RunState.FAILED: {
        RunState.RECOVERING,
    },
    RunState.RECOVERING: {
        RunState.RUNNING,
        RunState.FAILED,
    },
    RunState.CANCELLED: set(),  # terminal
    RunState.COMPLETED: set(),  # terminal
}


class RunStateMachine:
    """Finite state machine tracking the lifecycle of a single run.

    Enforces that only valid transitions are performed and keeps a history
    of every transition for auditability.
    """

    def __init__(self, initial_state: RunState = RunState.CREATED) -> None:
        self._state = initial_state
        self._history: list[tuple[RunState, RunState]] = []

    # -- properties -----------------------------------------------------------

    @property
    def state(self) -> RunState:
        """Return the current state."""
        return self._state

    @property
    def history(self) -> list[tuple[RunState, RunState]]:
        """Return a copy of the transition history as (from, to) tuples."""
        return list(self._history)

    @property
    def is_terminal(self) -> bool:
        """Return True if the run is in a terminal state."""
        return self._state in (RunState.CANCELLED, RunState.COMPLETED)

    # -- transitions ----------------------------------------------------------

    def can_transition(self, target: RunState) -> bool:
        """Check whether the transition from current state to *target* is valid."""
        return target in VALID_TRANSITIONS.get(self._state, set())

    def transition(self, target: RunState) -> RunState:
        """Attempt to transition to *target*.

        Returns the new state on success.

        Raises:
            InvalidTransitionError: If the transition is not allowed.
        """
        if not self.can_transition(target):
            raise InvalidTransitionError(self._state, target)

        previous = self._state
        self._state = target
        self._history.append((previous, target))
        return self._state

    def allowed_transitions(self) -> set[RunState]:
        """Return the set of states reachable from the current state."""
        return set(VALID_TRANSITIONS.get(self._state, set()))

    # -- convenience helpers --------------------------------------------------

    def start(self) -> RunState:
        """Transition from CREATED to RUNNING."""
        return self.transition(RunState.RUNNING)

    def begin_checkpoint(self) -> RunState:
        """Transition from RUNNING to CHECKPOINTING."""
        return self.transition(RunState.CHECKPOINTING)

    def commit_checkpoint(self) -> RunState:
        """Transition from CHECKPOINTING to COMMITTED."""
        return self.transition(RunState.COMMITTED)

    def resume(self) -> RunState:
        """Transition from COMMITTED back to RUNNING."""
        return self.transition(RunState.RUNNING)

    def fail(self) -> RunState:
        """Transition to FAILED from any state that permits it."""
        return self.transition(RunState.FAILED)

    def recover(self) -> RunState:
        """Transition from FAILED to RECOVERING."""
        return self.transition(RunState.RECOVERING)

    def cancel(self) -> RunState:
        """Transition to CANCELLED from any state that permits it."""
        return self.transition(RunState.CANCELLED)

    def complete(self) -> RunState:
        """Transition to COMPLETED from any state that permits it."""
        return self.transition(RunState.COMPLETED)

    # -- dunder ---------------------------------------------------------------

    def __repr__(self) -> str:
        return f"RunStateMachine(state={self._state.value!r})"
