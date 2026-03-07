import type { RunState, CheckpointState } from './types';

// ── State styling maps (single source of truth) ─────────────────────────────

export const RUN_STATE_CONFIG: Record<RunState, { bg: string; text: string; dot: string; label: string }> = {
  CREATED:       { bg: 'bg-state-neutral-muted', text: 'text-state-neutral',    dot: 'bg-state-neutral',    label: 'Created' },
  RUNNING:       { bg: 'bg-state-running-muted',  text: 'text-state-running',   dot: 'bg-state-running',    label: 'Running' },
  CHECKPOINTING: { bg: 'bg-state-checkpoint-muted', text: 'text-state-checkpoint', dot: 'bg-state-checkpoint', label: 'Checkpointing' },
  COMMITTED:     { bg: 'bg-state-committed-muted', text: 'text-state-committed', dot: 'bg-state-committed', label: 'Committed' },
  FAILED:        { bg: 'bg-state-failed-muted',  text: 'text-state-failed',     dot: 'bg-state-failed',     label: 'Failed' },
  RECOVERING:    { bg: 'bg-state-recovery-muted', text: 'text-state-recovery',  dot: 'bg-state-recovery',   label: 'Recovering' },
  CANCELLED:     { bg: 'bg-state-neutral-muted', text: 'text-state-neutral',    dot: 'bg-state-neutral',    label: 'Cancelled' },
  COMPLETED:     { bg: 'bg-state-committed-muted', text: 'text-state-committed', dot: 'bg-state-committed', label: 'Completed' },
};

export const CKPT_STATE_CONFIG: Record<CheckpointState, { bg: string; text: string }> = {
  PENDING:     { bg: 'bg-state-neutral-muted',    text: 'text-state-neutral' },
  IN_PROGRESS: { bg: 'bg-state-checkpoint-muted', text: 'text-state-checkpoint' },
  COMMITTED:   { bg: 'bg-state-running-muted',    text: 'text-state-running' },
  FAILED:      { bg: 'bg-state-failed-muted',     text: 'text-state-failed' },
};

export const WORKER_DOT: Record<string, string> = {
  ACTIVE:   'bg-state-running',
  active:   'bg-state-running',
  DEAD:     'bg-state-failed',
  dead:     'bg-state-failed',
  DRAINING: 'bg-state-checkpoint',
  IDLE:     'bg-state-neutral',
  idle:     'bg-state-neutral',
};

// ── Formatters ───────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function shortId(id: string, len = 12): string {
  return id.length > len ? id.slice(0, len) + '\u2026' : id;
}
