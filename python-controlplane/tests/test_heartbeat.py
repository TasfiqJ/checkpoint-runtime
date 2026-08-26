"""Tests for Phase 3 modules: heartbeat, worker_manager, recovery."""

from __future__ import annotations

import time

from controlplane.coordinator import Coordinator
from controlplane.heartbeat import HeartbeatConfig, HeartbeatManager, WorkerLease
from controlplane.models import RunConfig, RunState
from controlplane.recovery import RecoveryManager
from controlplane.worker_manager import WorkerManager


# ---------------------------------------------------------------------------
# WorkerLease
# ---------------------------------------------------------------------------


class TestWorkerLease:
    def test_initial_state(self) -> None:
        lease = WorkerLease(worker_id="w1", run_id="r1")
        assert lease.is_alive is True
        assert lease.last_step == 0

    def test_touch_updates_heartbeat(self) -> None:
        lease = WorkerLease(worker_id="w1", run_id="r1")
        old_hb = lease.last_heartbeat
        # Windows' monotonic clock can tick at roughly 15.6 ms intervals.
        time.sleep(0.02)
        lease.touch(step=10)
        assert lease.last_heartbeat > old_hb
        assert lease.last_step == 10

    def test_seconds_since_heartbeat(self) -> None:
        lease = WorkerLease(worker_id="w1", run_id="r1")
        time.sleep(0.05)
        assert lease.seconds_since_heartbeat() >= 0.04

    def test_is_expired(self) -> None:
        lease = WorkerLease(worker_id="w1", run_id="r1")
        assert lease.is_expired(timeout=100) is False
        # Simulate passage of time by backdating the heartbeat
        lease.last_heartbeat = time.monotonic() - 10
        assert lease.is_expired(timeout=5) is True


# ---------------------------------------------------------------------------
# HeartbeatManager
# ---------------------------------------------------------------------------


class TestHeartbeatManager:
    def test_register_and_get_lease(self) -> None:
        mgr = HeartbeatManager()
        lease = mgr.register("w1", "r1")
        assert lease.worker_id == "w1"
        assert mgr.get_lease("w1") is lease

    def test_unregister(self) -> None:
        mgr = HeartbeatManager()
        lease = mgr.register("w1", "r1")
        mgr.unregister("w1")
        assert mgr.get_lease("w1") is None
        assert lease.is_alive is False

    def test_record_heartbeat(self) -> None:
        mgr = HeartbeatManager()
        mgr.register("w1", "r1")
        lease = mgr.record_heartbeat("w1", step=42)
        assert lease is not None
        assert lease.last_step == 42

    def test_record_heartbeat_unknown_worker(self) -> None:
        mgr = HeartbeatManager()
        assert mgr.record_heartbeat("unknown", step=0) is None

    def test_get_heartbeat_lags(self) -> None:
        mgr = HeartbeatManager()
        mgr.register("w1", "r1")
        mgr.register("w2", "r1")
        lags = mgr.get_heartbeat_lags()
        assert "w1" in lags
        assert "w2" in lags

    def test_failure_callback_fires(self) -> None:
        coord = Coordinator(use_memory=True)
        config = HeartbeatConfig(dead_threshold_seconds=0.0)
        mgr = HeartbeatManager(config=config, coordinator=coord)

        failures: list[tuple[str, str]] = []
        # Callback signature is (worker_id, run_id)
        mgr.on_worker_failure(lambda wid, rid: failures.append((wid, rid)))

        # Register a worker in the coordinator so mark_worker_dead works
        run = coord.create_run(RunConfig(name="test", num_workers=1))
        w = coord.register_worker(run.run_id, rank=0)
        mgr.register(w.worker_id, run.run_id)

        # Backdate the heartbeat to trigger failure
        lease = mgr.get_lease(w.worker_id)
        assert lease is not None
        lease.last_heartbeat = time.monotonic() - 100

        mgr._check_leases()
        assert len(failures) == 1
        assert failures[0] == (w.worker_id, run.run_id)

    def test_dead_worker_not_re_checked(self) -> None:
        mgr = HeartbeatManager(config=HeartbeatConfig(dead_threshold_seconds=0.0))
        mgr.register("w1", "r1")
        lease = mgr.get_lease("w1")
        assert lease is not None
        lease.last_heartbeat = time.monotonic() - 100

        failures: list[tuple[str, str]] = []
        mgr.on_worker_failure(lambda wid, rid: failures.append((wid, rid)))

        mgr._check_leases()
        mgr._check_leases()  # second check should skip the dead worker
        assert len(failures) == 1


# ---------------------------------------------------------------------------
# WorkerManager
# ---------------------------------------------------------------------------


class TestWorkerManager:
    def test_register_worker_auto_rank(self) -> None:
        coord = Coordinator(use_memory=True)
        run = coord.create_run(RunConfig(name="test", num_workers=2))
        mgr = WorkerManager(coordinator=coord)

        w0 = mgr.register_worker(run.run_id, hostname="node-0")
        w1 = mgr.register_worker(run.run_id, hostname="node-1")
        assert w0.rank == 0
        assert w1.rank == 1

    def test_rehydrates_persisted_workers_after_restart(self) -> None:
        coord = Coordinator(use_memory=True)
        run = coord.create_run(RunConfig(name="test", num_workers=2))
        original = WorkerManager(coordinator=coord)
        w0 = original.register_worker(run.run_id, hostname="node-0")
        w1 = original.register_worker(run.run_id, hostname="node-1")

        restarted_heartbeats = HeartbeatManager()
        restarted = WorkerManager(
            coordinator=coord,
            heartbeat_mgr=restarted_heartbeats,
        )

        assert {w.worker_id for w in restarted.get_run_workers(run.run_id)} == {
            w0.worker_id,
            w1.worker_id,
        }
        assert restarted_heartbeats.get_lease(w0.worker_id) is not None
        assert restarted.update_worker_heartbeat(w0.worker_id, step=42) is not None
        assert restarted.register_worker(run.run_id).rank == 2

    def test_explicit_rank_replaces_previous_registration(self) -> None:
        coord = Coordinator(use_memory=True)
        run = coord.create_run(RunConfig(name="test", num_workers=2))
        mgr = WorkerManager(coordinator=coord)
        old_rank_zero = mgr.register_worker(run.run_id, rank=0)
        rank_one = mgr.register_worker(run.run_id, rank=1)

        new_rank_zero = mgr.register_worker(run.run_id, rank=0)

        assert new_rank_zero.rank == 0
        assert mgr.get_worker(old_rank_zero.worker_id).status == "SUPERSEDED"
        assert mgr.get_worker(rank_one.worker_id).status == "ACTIVE"
        assert mgr.active_worker_count(run.run_id) == 2

        assert mgr.update_worker_heartbeat(old_rank_zero.worker_id, step=999) is None
        persisted_old = next(
            worker
            for worker in coord.list_workers(run.run_id)
            if worker.worker_id == old_rank_zero.worker_id
        )
        assert persisted_old.status == "SUPERSEDED"

    def test_deregister_worker(self) -> None:
        coord = Coordinator(use_memory=True)
        run = coord.create_run(RunConfig(name="test", num_workers=1))
        mgr = WorkerManager(coordinator=coord)
        w = mgr.register_worker(run.run_id)
        mgr.deregister_worker(w.worker_id)
        assert mgr.get_worker(w.worker_id).status == "DEREGISTERED"
        assert coord.list_workers(run.run_id)[0].status == "DEREGISTERED"

        heartbeat_mgr = HeartbeatManager()
        restarted_mgr = WorkerManager(coord, heartbeat_mgr)
        assert restarted_mgr.get_worker(w.worker_id).status == "DEREGISTERED"
        assert heartbeat_mgr.get_lease(w.worker_id) is None

    def test_get_run_workers(self) -> None:
        coord = Coordinator(use_memory=True)
        run = coord.create_run(RunConfig(name="test", num_workers=2))
        mgr = WorkerManager(coordinator=coord)
        mgr.register_worker(run.run_id, hostname="a")
        mgr.register_worker(run.run_id, hostname="b")
        workers = mgr.get_run_workers(run.run_id)
        assert len(workers) == 2

    def test_update_heartbeat(self) -> None:
        coord = Coordinator(use_memory=True)
        run = coord.create_run(RunConfig(name="test", num_workers=1))
        hb = HeartbeatManager()
        mgr = WorkerManager(coordinator=coord, heartbeat_mgr=hb)
        w = mgr.register_worker(run.run_id)
        updated = mgr.update_worker_heartbeat(w.worker_id, step=99)
        assert updated is not None
        assert updated.current_step == 99

    def test_heartbeat_unknown_worker(self) -> None:
        coord = Coordinator(use_memory=True)
        mgr = WorkerManager(coordinator=coord)
        assert mgr.update_worker_heartbeat("unknown", step=0) is None

    def test_active_worker_count(self) -> None:
        coord = Coordinator(use_memory=True)
        run = coord.create_run(RunConfig(name="test", num_workers=2))
        mgr = WorkerManager(coordinator=coord)
        mgr.register_worker(run.run_id)
        mgr.register_worker(run.run_id)
        assert mgr.active_worker_count(run.run_id) == 2

    def test_failure_callback_marks_dead(self) -> None:
        coord = Coordinator(use_memory=True)
        run = coord.create_run(RunConfig(name="test", num_workers=1))
        hb = HeartbeatManager(config=HeartbeatConfig(dead_threshold_seconds=0.0))
        mgr = WorkerManager(coordinator=coord, heartbeat_mgr=hb)
        w = mgr.register_worker(run.run_id)

        # Backdate heartbeat
        lease = hb.get_lease(w.worker_id)
        assert lease is not None
        lease.last_heartbeat = time.monotonic() - 100

        # Register the worker in coordinator so mark_worker_dead works
        hb._check_leases()

        worker = mgr.get_worker(w.worker_id)
        assert worker is not None
        assert worker.status == "DEAD"


# ---------------------------------------------------------------------------
# RecoveryManager
# ---------------------------------------------------------------------------


class TestRecoveryManager:
    def _create_running_run(self, coord: Coordinator) -> str:
        run = coord.create_run(RunConfig(name="rec-test", num_workers=1))
        coord.transition_run(run.run_id, RunState.RUNNING)
        return run.run_id

    def test_manual_recovery(self) -> None:
        coord = Coordinator(use_memory=True)
        run_id = self._create_running_run(coord)
        coord.transition_run(run_id, RunState.FAILED)

        restarted_runs: list[str] = []
        rmgr = RecoveryManager(
            coordinator=coord,
            auto_recover=False,
            restart_worker_group=lambda failed_run_id: restarted_runs.append(failed_run_id) or True,
        )
        assert rmgr.recover_run(run_id) is True

        status = coord.get_run(run_id)
        assert status is not None
        assert status.state == RunState.RECOVERING
        assert restarted_runs == [run_id]

    def test_manual_recovery_non_failed_run(self) -> None:
        coord = Coordinator(use_memory=True)
        run_id = self._create_running_run(coord)

        rmgr = RecoveryManager(coordinator=coord, auto_recover=False)
        assert rmgr.recover_run(run_id) is False

    def test_manual_recovery_nonexistent_run(self) -> None:
        coord = Coordinator(use_memory=True)
        rmgr = RecoveryManager(coordinator=coord)
        assert rmgr.recover_run("does-not-exist") is False

    def test_auto_recovery_on_failure(self) -> None:
        coord = Coordinator(use_memory=True)
        run_id = self._create_running_run(coord)
        restarted_runs: list[str] = []

        hb = HeartbeatManager(config=HeartbeatConfig(dead_threshold_seconds=0.0))
        _rmgr = RecoveryManager(
            coordinator=coord,
            heartbeat_mgr=hb,
            auto_recover=True,
            restart_worker_group=lambda failed_run_id: restarted_runs.append(failed_run_id) or True,
        )

        w = coord.register_worker(run_id, rank=0)
        hb.register(w.worker_id, run_id)

        # Backdate heartbeat to trigger failure
        lease = hb.get_lease(w.worker_id)
        assert lease is not None
        lease.last_heartbeat = time.monotonic() - 100

        hb._check_leases()

        # Recovery is not declared complete until a restarted worker restores
        # its checkpoint and explicitly resumes the run.
        status = coord.get_run(run_id)
        assert status is not None
        assert status.state == RunState.RECOVERING
        assert restarted_runs == [run_id]

    def test_abort_pending_checkpoints_on_failure(self) -> None:
        coord = Coordinator(use_memory=True)
        run_id = self._create_running_run(coord)

        # Create a pending checkpoint
        cp = coord.create_checkpoint(run_id, step=100)
        assert cp.state == "PENDING"

        coord.transition_run(run_id, RunState.FAILED)
        rmgr = RecoveryManager(coordinator=coord, auto_recover=False)
        rmgr.recover_run(run_id)

        # Checkpoint should have been aborted
        updated_cp = coord.get_checkpoint(cp.checkpoint_id)
        assert updated_cp is not None
        assert updated_cp.state == "FAILED"
        status = coord.get_run(run_id)
        assert status is not None
        assert status.state == RunState.FAILED

    def test_auto_recovery_without_supervisor_remains_failed(self) -> None:
        coord = Coordinator(use_memory=True)
        run_id = self._create_running_run(coord)
        hb = HeartbeatManager(config=HeartbeatConfig(dead_threshold_seconds=0.0))
        _rmgr = RecoveryManager(
            coordinator=coord,
            heartbeat_mgr=hb,
            auto_recover=True,
        )
        hb.register("worker-no-supervisor", run_id)
        lease = hb.get_lease("worker-no-supervisor")
        assert lease is not None
        lease.last_heartbeat = time.monotonic() - 100

        hb._check_leases()

        status = coord.get_run(run_id)
        assert status is not None
        assert status.state == RunState.FAILED

    def test_recovery_of_terminal_run_skipped(self) -> None:
        coord = Coordinator(use_memory=True)
        run = coord.create_run(RunConfig(name="term", num_workers=1))
        coord.transition_run(run.run_id, RunState.RUNNING)
        coord.transition_run(run.run_id, RunState.COMPLETED)

        rmgr = RecoveryManager(coordinator=coord)
        # Directly calling _handle_failure should not crash on terminal state
        rmgr._handle_failure(run.run_id, "w1")

        status = coord.get_run(run.run_id)
        assert status is not None
        assert status.state == RunState.COMPLETED
