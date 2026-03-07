import type { RunState, CheckpointState } from '../types';
import { RUN_STATE_CONFIG, CKPT_STATE_CONFIG } from '../design';

// ── Run State Badge ──────────────────────────────────────────────────────────

export function RunBadge({ state, size = 'sm' }: { state: RunState; size?: 'sm' | 'md' }) {
  const cfg = RUN_STATE_CONFIG[state] ?? RUN_STATE_CONFIG.CREATED;
  const sizeClass = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-2xs';
  return (
    <span className={`badge ${sizeClass} ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {state}
    </span>
  );
}

// ── Checkpoint State Badge ───────────────────────────────────────────────────

export function CkptBadge({ state }: { state: CheckpointState }) {
  const cfg = CKPT_STATE_CONFIG[state] ?? CKPT_STATE_CONFIG.PENDING;
  return (
    <span className={`badge ${cfg.bg} ${cfg.text}`}>
      {state}
    </span>
  );
}

// ── Metric Card ──────────────────────────────────────────────────────────────

export function MetricCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <p className="metric-label">{label}</p>
      <p className={`metric-value ${valueColor ?? ''}`}>{value}</p>
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h2 className="page-header">{title}</h2>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-text-tertiary">
      <p className="text-sm">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ── Error Banner ─────────────────────────────────────────────────────────────

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 text-sm text-state-failed bg-state-failed-muted border border-state-failed/20 rounded-lg px-4 py-3">
      {message}
    </div>
  );
}

// ── Loading ──────────────────────────────────────────────────────────────────

export function Loading({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-text-tertiary text-sm">
      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {text}
    </div>
  );
}

// ── Live Indicator ───────────────────────────────────────────────────────────

export function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-state-running opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-state-running" />
    </span>
  );
}
