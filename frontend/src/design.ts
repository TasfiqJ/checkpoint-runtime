import type { RunState, CheckpointState } from './types';

// ── State styling maps (single source of truth) ─────────────────────────────

export const RUN_STATE_CONFIG: Record<RunState, { bg: string; text: string; dot: string; label: string; desc: string }> = {
  CREATED:       { bg: 'bg-muted-bg',     text: 'text-muted',     dot: 'bg-muted',     label: 'Created',       desc: 'Waiting to start' },
  RUNNING:       { bg: 'bg-ok-muted',     text: 'text-ok',        dot: 'bg-ok',        label: 'Running',       desc: 'Training in progress' },
  CHECKPOINTING: { bg: 'bg-warn-muted',   text: 'text-warn',      dot: 'bg-warn',      label: 'Saving',        desc: 'Saving a checkpoint' },
  COMMITTED:     { bg: 'bg-info-muted',   text: 'text-info',      dot: 'bg-info',      label: 'Saved',         desc: 'Checkpoint saved successfully' },
  FAILED:        { bg: 'bg-err-muted',    text: 'text-err',       dot: 'bg-err',       label: 'Failed',        desc: 'A worker crashed' },
  RECOVERING:    { bg: 'bg-recover-muted', text: 'text-recover',  dot: 'bg-recover',   label: 'Recovering',    desc: 'Loading last save...' },
  CANCELLED:     { bg: 'bg-muted-bg',     text: 'text-muted',     dot: 'bg-muted',     label: 'Cancelled',     desc: 'Stopped by user' },
  COMPLETED:     { bg: 'bg-info-muted',   text: 'text-info',      dot: 'bg-info',      label: 'Done',          desc: 'Training finished' },
};

export const CKPT_STATE_CONFIG: Record<CheckpointState, { bg: string; text: string }> = {
  PENDING:     { bg: 'bg-muted-bg',   text: 'text-muted' },
  IN_PROGRESS: { bg: 'bg-warn-muted', text: 'text-warn' },
  COMMITTED:   { bg: 'bg-ok-muted',   text: 'text-ok' },
  FAILED:      { bg: 'bg-err-muted',  text: 'text-err' },
};

export const WORKER_DOT: Record<string, string> = {
  ACTIVE: 'bg-ok', active: 'bg-ok',
  DEAD: 'bg-err', dead: 'bg-err',
  DRAINING: 'bg-warn',
  IDLE: 'bg-muted', idle: 'bg-muted',
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
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
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
