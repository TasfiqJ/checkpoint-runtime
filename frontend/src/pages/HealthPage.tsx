import { useState, useEffect, useCallback } from 'react';
import type { HealthStatus, HealthLevel, WorkerInfo } from '../types';
import { API_BASE } from '../config/api';
import { WORKER_DOT, formatUptime, formatTime } from '../design';
import { SectionHeader, ErrorBanner, Loading } from '../components/ui';

// ── Config ───────────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<HealthLevel, { label: string; dot: string; border: string }> = {
  HEALTHY:   { label: 'All Systems Operational', dot: 'bg-state-running',    border: 'border-l-state-running' },
  DEGRADED:  { label: 'Degraded Performance',    dot: 'bg-state-checkpoint', border: 'border-l-state-checkpoint' },
  UNHEALTHY: { label: 'System Unhealthy',        dot: 'bg-state-failed',     border: 'border-l-state-failed' },
};

function lagColor(lag: number): string {
  if (lag < 5) return 'text-state-running';
  if (lag < 30) return 'text-state-checkpoint';
  return 'text-state-failed';
}

function lagBarColor(lag: number): string {
  if (lag < 5) return 'bg-state-running';
  if (lag < 30) return 'bg-state-checkpoint';
  return 'bg-state-failed';
}

function LagIndicator({ lag }: { lag: number }) {
  const pct = Math.min(100, (lag / 60) * 100);
  return (
    <div className="h-1 w-20 bg-surface-3 rounded-full overflow-hidden">
      <div className={`h-1 rounded-full ${lagBarColor(lag)} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [lags, setLags] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [healthRes, workersRes, lagsRes] = await Promise.all([
        fetch(`${API_BASE}/api/health`),
        fetch(`${API_BASE}/api/workers`),
        fetch(`${API_BASE}/api/metrics/heartbeat-lags`),
      ]);
      if (!healthRes.ok) throw new Error(`Health: ${healthRes.status}`);
      if (!workersRes.ok) throw new Error(`Workers: ${workersRes.status}`);
      if (!lagsRes.ok) throw new Error(`Lags: ${lagsRes.status}`);

      setHealth(await healthRes.json());
      setWorkers(await workersRes.json());
      const lagsData = await lagsRes.json();
      setLags(lagsData.lags ?? lagsData);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch health data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 5000);
    return () => clearInterval(id);
  }, [fetchAll]);

  if (loading) return <Loading text="Loading health data..." />;

  const cfg = health ? HEALTH_CONFIG[health.status] : HEALTH_CONFIG.HEALTHY;

  return (
    <div>
      <SectionHeader
        title="System Health"
        subtitle="Monitor workers, heartbeat status, and system health indicators."
      />

      {error && <ErrorBanner message={error} />}

      {/* Overall status banner */}
      {health && (
        <div className={`card overflow-hidden mb-6 border-l-2 ${cfg.border}`}>
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
              <h3 className="text-base font-semibold text-text-primary">{cfg.label}</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-2xs font-medium text-text-tertiary uppercase tracking-wider">Version</span>
                <p className="text-sm text-text-primary font-mono mt-0.5">{health.version}</p>
              </div>
              <div>
                <span className="text-2xs font-medium text-text-tertiary uppercase tracking-wider">Uptime</span>
                <p className="text-sm text-text-primary mt-0.5">{formatUptime(health.uptime_seconds)}</p>
              </div>
              <div>
                <span className="text-2xs font-medium text-text-tertiary uppercase tracking-wider">Active Runs</span>
                <p className="text-sm text-text-primary mt-0.5">{health.active_runs}</p>
              </div>
              <div>
                <span className="text-2xs font-medium text-text-tertiary uppercase tracking-wider">etcd</span>
                <p className={`text-sm mt-0.5 font-medium ${health.etcd_connected ? 'text-state-running' : 'text-state-failed'}`}>
                  {health.etcd_connected ? 'Connected' : 'Disconnected'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Worker section */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Workers ({workers.length})</h3>
      </div>

      {workers.length === 0 && (
        <div className="text-center py-12 text-sm text-text-tertiary">No workers registered.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {workers.map((w) => {
          const lag = lags[w.worker_id] ?? 0;
          const isActive = w.status === 'ACTIVE' || w.status === 'active';
          return (
            <div key={w.worker_id} className="card p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">Worker {w.rank}</p>
                  <p className="text-2xs font-mono text-text-tertiary mt-0.5">
                    {w.worker_id.length > 16 ? w.worker_id.slice(0, 16) + '\u2026' : w.worker_id}
                  </p>
                </div>
                <span className={`badge ${
                  isActive
                    ? 'bg-state-running-muted text-state-running'
                    : 'bg-state-failed-muted text-state-failed'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${WORKER_DOT[w.status] ?? 'bg-state-neutral'}`} />
                  {w.status}
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-2xs text-text-tertiary">Step</span>
                  <p className="text-text-primary font-mono mt-0.5">{w.current_step.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-2xs text-text-tertiary">Heartbeat</span>
                  <p className="text-text-primary mt-0.5">{formatTime(w.last_heartbeat)}</p>
                </div>
                <div>
                  <span className="text-2xs text-text-tertiary">Lag</span>
                  <p className={`font-medium mt-0.5 ${lagColor(lag)}`}>{lag.toFixed(1)}s</p>
                </div>
              </div>

              {/* Lag bar */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-2xs text-text-tertiary">Heartbeat lag</span>
                <LagIndicator lag={lag} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HealthPage;
