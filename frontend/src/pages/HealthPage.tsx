import { useState, useEffect, useCallback } from 'react';
import type { HealthStatus, HealthLevel, WorkerInfo } from '../types';
import { API_BASE } from '../config/api';
import { WORKER_DOT, formatUptime, formatTime } from '../design';
import { SectionHeader, ErrorBanner, Loading } from '../components/ui';

// -- Config -------------------------------------------------------------------

const HEALTH_CONFIG: Record<HealthLevel, { label: string; dot: string; border: string }> = {
  HEALTHY:   { label: 'All Systems Operational', dot: 'bg-ok',   border: 'border-l-ok' },
  DEGRADED:  { label: 'Degraded Performance',    dot: 'bg-warn', border: 'border-l-warn' },
  UNHEALTHY: { label: 'System Unhealthy',        dot: 'bg-err',  border: 'border-l-err' },
};

function lagColor(lag: number): string {
  if (lag < 5) return 'text-ok';
  if (lag < 30) return 'text-warn';
  return 'text-err';
}

function lagBarColor(lag: number): string {
  if (lag < 5) return 'bg-ok';
  if (lag < 30) return 'bg-warn';
  return 'bg-err';
}

function LagIndicator({ lag }: { lag: number }) {
  const pct = Math.min(100, (lag / 60) * 100);
  return (
    <div className="h-1 w-20 bg-surface-3 rounded-full overflow-hidden">
      <div className={`h-1 rounded-full ${lagBarColor(lag)} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// -- Main page ----------------------------------------------------------------

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
              <h3 className="text-base font-semibold text-txt-1">{cfg.label}</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-2xs font-medium text-txt-3 uppercase tracking-wider">Version</span>
                <p className="text-sm text-txt-1 font-mono mt-0.5">{health.version}</p>
              </div>
              <div>
                <span className="text-2xs font-medium text-txt-3 uppercase tracking-wider">Uptime</span>
                <p className="text-sm text-txt-1 mt-0.5">{formatUptime(health.uptime_seconds)}</p>
              </div>
              <div>
                <span className="text-2xs font-medium text-txt-3 uppercase tracking-wider">Active Runs</span>
                <p className="text-sm text-txt-1 mt-0.5">{health.active_runs}</p>
              </div>
              <div>
                <span className="text-2xs font-medium text-txt-3 uppercase tracking-wider">etcd</span>
                <p className={`text-sm mt-0.5 font-medium ${health.etcd_connected ? 'text-ok' : 'text-err'}`}>
                  {health.etcd_connected ? 'Connected' : 'Disconnected'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Worker section */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-txt-1">Workers ({workers.length})</h3>
      </div>

      {workers.length === 0 && (
        <div className="text-center py-12 text-sm text-txt-3">No workers registered.</div>
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
                  <p className="text-sm font-semibold text-txt-1">Worker {w.rank}</p>
                  <p className="text-2xs font-mono text-txt-3 mt-0.5">
                    {w.worker_id.length > 16 ? w.worker_id.slice(0, 16) + '\u2026' : w.worker_id}
                  </p>
                </div>
                <span className={`badge ${
                  isActive
                    ? 'bg-ok-muted text-ok'
                    : 'bg-err-muted text-err'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${WORKER_DOT[w.status] ?? 'bg-muted'}`} />
                  {w.status}
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-2xs text-txt-3">Step</span>
                  <p className="text-txt-1 font-mono mt-0.5">{w.current_step.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-2xs text-txt-3">Heartbeat</span>
                  <p className="text-txt-1 mt-0.5">{formatTime(w.last_heartbeat)}</p>
                </div>
                <div>
                  <span className="text-2xs text-txt-3">Lag</span>
                  <p className={`font-medium mt-0.5 ${lagColor(lag)}`}>{lag.toFixed(1)}s</p>
                </div>
              </div>

              {/* Lag bar */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-2xs text-txt-3">Heartbeat lag</span>
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
