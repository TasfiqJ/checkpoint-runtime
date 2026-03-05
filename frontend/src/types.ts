// ── Run ──────────────────────────────────────────────────────────────────────

export type RunState =
  | 'CREATED'
  | 'RUNNING'
  | 'CHECKPOINTING'
  | 'COMMITTED'
  | 'FAILED'
  | 'RECOVERING'
  | 'CANCELLED'
  | 'COMPLETED';

export interface RunStatus {
  run_id: string;
  name: string;
  state: RunState;
  current_step: number;
  active_workers: number;
  created_at: string;
  updated_at: string;
  error_message?: string;
}

export interface RunConfig {
  name: string;
  num_workers: number;
  checkpoint_interval_steps: number;
}

// ── Checkpoint ───────────────────────────────────────────────────────────────

export type CheckpointState = 'PENDING' | 'IN_PROGRESS' | 'COMMITTED' | 'FAILED';

export interface CheckpointInfo {
  checkpoint_id: string;
  run_id: string;
  step: number;
  state: CheckpointState;
  num_shards: number;
  total_bytes: number;
  created_at: string;
  shard_ids: string[];
}

// ── Worker ────────────────────────────────────────────────────────────────────

export interface WorkerInfo {
  worker_id: string;
  run_id: string;
  rank: number;
  status: string;
  last_heartbeat: string;
  current_step: number;
}

// ── Health ────────────────────────────────────────────────────────────────────

export type HealthLevel = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

export interface HealthStatus {
  status: HealthLevel;
  version: string;
  uptime_seconds: number;
  active_runs: number;
  etcd_connected: boolean;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export interface MetricsSummary {
  total_runs: number;
  active_runs: number;
  total_checkpoints: number;
  total_checkpoint_bytes: number;
  total_workers: number;
  active_workers: number;
  checkpoint_success_rate: number;
}

// ── SSE Event ────────────────────────────────────────────────────────────────

export interface RunEvent {
  id?: string;
  type: string;
  data: string;
  timestamp: string;
}
