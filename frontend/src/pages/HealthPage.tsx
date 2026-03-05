import { useState, useEffect, useCallback, useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import type { HealthStatus, HealthLevel, WorkerInfo } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<HealthLevel, { label: string; dot: string; banner: string }> = {
  HEALTHY:   { label: 'All Systems Operational',       dot: 'bg-green-500',  banner: 'border-green-800 bg-green-900/20' },
  DEGRADED:  { label: 'Degraded Performance',          dot: 'bg-yellow-500', banner: 'border-yellow-800 bg-yellow-900/20' },
  UNHEALTHY: { label: 'System Unhealthy',              dot: 'bg-red-500',    banner: 'border-red-800 bg-red-900/20' },
};

function lagColor(lag: number): string {
  if (lag < 5)  return 'text-green-400';
  if (lag < 30) return 'text-yellow-400';
  return 'text-red-400';
}

function lagBorder(lag: number): string {
  if (lag < 5)  return 'border-green-800/50';
  if (lag < 30) return 'border-yellow-800/50';
  return 'border-red-800/50';
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

// ── Sparkline: generates mock error-rate data and renders a mini line ──────

function ErrorSparkline({ workerId }: { workerId: string }) {
  // Generate deterministic-ish mock data based on worker id
  const data = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < workerId.length; i++) seed += workerId.charCodeAt(i);
    return Array.from({ length: 20 }, (_, i) => {
      const noise = Math.sin(seed * (i + 1)) * 0.5 + 0.5;
      return { v: Math.max(0, noise * 3 + Math.random() * 1.5) };
    });
  }, [workerId]);

  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis domain={[0, 'auto']} hide />
          <Line type="monotone" dataKey="v" stroke="#ef4444" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
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
        fetch('/api/health'),
        fetch('/api/workers'),
        fetch('/api/metrics/heartbeat-lags'),
      ]);

      if (!healthRes.ok) throw new Error(`Health: ${healthRes.status}`);
      if (!workersRes.ok) throw new Error(`Workers: ${workersRes.status}`);
      if (!lagsRes.ok) throw new Error(`Lags: ${lagsRes.status}`);

      setHealth(await healthRes.json());
      setWorkers(await workersRes.json());
      setLags(await lagsRes.json());
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

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-500 text-sm">Loading health data...</div>;
  }

  const cfg = health ? HEALTH_CONFIG[health.status] : HEALTH_CONFIG.HEALTHY;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-100">System Health</h2>
        <p className="mt-1 text-sm text-gray-400">
          Monitor workers, heartbeat status, and system health indicators.
        </p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Overall status banner */}
      {health && (
        <div className={`rounded-lg border p-6 mb-8 ${cfg.banner}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
            <h3 className="text-lg font-semibold text-gray-100">{cfg.label}</h3>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Version</span>
              <p className="text-gray-200 font-mono">{health.version}</p>
            </div>
            <div>
              <span className="text-gray-400">Uptime</span>
              <p className="text-gray-200">{formatUptime(health.uptime_seconds)}</p>
            </div>
            <div>
              <span className="text-gray-400">Active Runs</span>
              <p className="text-gray-200">{health.active_runs}</p>
            </div>
            <div>
              <span className="text-gray-400">etcd</span>
              <p className={health.etcd_connected ? 'text-green-400' : 'text-red-400'}>
                {health.etcd_connected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Worker cards */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-100">Workers ({workers.length})</h3>
      </div>

      {workers.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-500">No workers registered.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workers.map((w) => {
          const lag = lags[w.worker_id] ?? 0;
          return (
            <div
              key={w.worker_id}
              className={`bg-gray-900 rounded-lg border p-4 ${lagBorder(lag)}`}
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-100">Worker {w.rank}</p>
                  <p className="text-xs font-mono text-gray-500">
                    {w.worker_id.length > 16 ? w.worker_id.slice(0, 16) + '\u2026' : w.worker_id}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  w.status === 'ACTIVE' || w.status === 'active'
                    ? 'bg-green-900/50 text-green-400'
                    : w.status === 'IDLE' || w.status === 'idle'
                    ? 'bg-gray-700/50 text-gray-400'
                    : 'bg-red-900/50 text-red-400'
                }`}>
                  {w.status}
                </span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-500">Step</span>
                  <p className="text-gray-200 font-mono">{w.current_step.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-500">Heartbeat</span>
                  <p className="text-gray-200">{formatTime(w.last_heartbeat)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Lag</span>
                  <p className={`font-medium ${lagColor(lag)}`}>
                    {lag.toFixed(1)}s
                  </p>
                </div>
              </div>

              {/* Error sparkline */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">Error rate</span>
                <ErrorSparkline workerId={w.worker_id} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HealthPage;
