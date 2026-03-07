import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { MetricsSummary } from '../types';
import { API_BASE } from '../config/api';
import { formatBytes } from '../design';
import { SectionHeader, MetricCard, ErrorBanner, Loading } from '../components/ui';

// ── Types ────────────────────────────────────────────────────────────────────

interface LatencyPoint {
  index: number;
  save: number;
  restore: number;
}

interface PerformanceData {
  latency: LatencyPoint[];
  total_checkpoint_bytes: number;
  checkpoint_count: number;
}

// ── Utilisation bar ──────────────────────────────────────────────────────────

function UtilBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const barColor = pct > 80 ? 'bg-state-failed' : pct > 60 ? 'bg-state-checkpoint' : color;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-tertiary font-mono">{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div className={`h-1.5 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Chart tooltip ────────────────────────────────────────────────────────────

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function DarkTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-3 border border-border-emphasis rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-text-tertiary mb-1">#{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name}: {p.value.toFixed(2)}s
        </p>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

function PerformancePage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [perfData, setPerfData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [metricsRes, perfRes] = await Promise.all([
        fetch(`${API_BASE}/api/metrics/summary`),
        fetch(`${API_BASE}/api/metrics/performance`),
      ]);
      if (!metricsRes.ok) throw new Error(`Metrics: ${metricsRes.status} ${metricsRes.statusText}`);
      setMetrics(await metricsRes.json());
      if (perfRes.ok) setPerfData(await perfRes.json());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading) return <Loading text="Loading metrics..." />;

  const latencyData = perfData?.latency ?? [];
  const hasLatencyData = latencyData.length > 0;

  return (
    <div>
      <SectionHeader
        title="Performance Metrics"
        subtitle="Checkpoint save/restore throughput, latency, and resource utilization."
      />

      {error && <ErrorBanner message={error} />}

      {/* Key metric cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <MetricCard label="Total Runs" value={metrics.total_runs} />
          <MetricCard label="Active Runs" value={metrics.active_runs} valueColor="text-accent" />
          <MetricCard label="Total Checkpoints" value={metrics.total_checkpoints} />
          <MetricCard label="Checkpoint Size" value={formatBytes(metrics.total_checkpoint_bytes)} />
          <MetricCard label="Active Workers" value={`${metrics.active_workers} / ${metrics.total_workers}`} />
          <MetricCard
            label="Success Rate"
            value={`${(metrics.checkpoint_success_rate * 100).toFixed(1)}%`}
            valueColor={
              metrics.checkpoint_success_rate >= 0.95 ? 'text-state-running' :
              metrics.checkpoint_success_rate >= 0.8 ? 'text-state-checkpoint' :
              'text-state-failed'
            }
          />
        </div>
      )}

      {/* Latency chart */}
      <div className="card p-5 mb-6">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Checkpoint Latency Over Time</h3>
        {hasLatencyData ? (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latencyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e28" />
                  <XAxis dataKey="index" tick={{ fill: '#55556a', fontSize: 10 }} stroke="#1e1e28" />
                  <YAxis tick={{ fill: '#55556a', fontSize: 10 }} stroke="#1e1e28" unit="s" />
                  <Tooltip content={<DarkTooltip />} />
                  <Line type="monotone" dataKey="save" name="Save" stroke="#818cf8" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="restore" name="Restore" stroke="#34d399" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-5 mt-3">
              <span className="flex items-center gap-1.5 text-2xs text-text-tertiary">
                <span className="w-3 h-0.5 bg-accent-hover inline-block rounded" /> Save Latency
              </span>
              <span className="flex items-center gap-1.5 text-2xs text-text-tertiary">
                <span className="w-3 h-0.5 bg-state-running inline-block rounded" /> Restore Latency
              </span>
            </div>
          </>
        ) : (
          <div className="h-64 flex items-center justify-center text-text-tertiary text-sm">
            No checkpoint latency data yet. Trigger a checkpoint to see metrics.
          </div>
        )}
      </div>

      {/* Throughput */}
      <div className="card p-5 mb-6">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Throughput</h3>
        {perfData && perfData.checkpoint_count > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xs font-medium text-text-tertiary uppercase tracking-wider">Total Data Written</p>
              <p className="text-2xl font-semibold text-text-primary mt-1 font-mono">{formatBytes(perfData.total_checkpoint_bytes)}</p>
            </div>
            <div>
              <p className="text-2xs font-medium text-text-tertiary uppercase tracking-wider">Checkpoints Completed</p>
              <p className="text-2xl font-semibold text-text-primary mt-1 font-mono">{perfData.checkpoint_count}</p>
            </div>
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center text-text-tertiary text-sm">
            No throughput data yet. Complete a checkpoint cycle to see metrics.
          </div>
        )}
      </div>

      {/* External links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <a
          href="http://localhost:3001"
          target="_blank"
          rel="noopener noreferrer"
          className="card p-4 hover:border-accent/30 transition-colors group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-text-primary group-hover:text-accent-hover transition-colors">
                Grafana Dashboards
              </h4>
              <p className="text-2xs text-text-tertiary mt-1">Full metrics dashboards with custom panels</p>
            </div>
            <svg className="w-4 h-4 text-text-tertiary group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </div>
          <p className="text-2xs text-text-tertiary font-mono mt-2">localhost:3001</p>
        </a>
        <a
          href="http://localhost:16686"
          target="_blank"
          rel="noopener noreferrer"
          className="card p-4 hover:border-accent/30 transition-colors group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-text-primary group-hover:text-accent-hover transition-colors">
                Jaeger Tracing
              </h4>
              <p className="text-2xs text-text-tertiary mt-1">Distributed trace viewer for checkpoint operations</p>
            </div>
            <svg className="w-4 h-4 text-text-tertiary group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </div>
          <p className="text-2xs text-text-tertiary font-mono mt-2">localhost:16686</p>
        </a>
      </div>

      {/* Resource utilisation */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Resource Utilization</h3>
        {metrics ? (
          <div className="space-y-4">
            <UtilBar label="Workers Active" pct={metrics.total_workers > 0 ? Math.round((metrics.active_workers / metrics.total_workers) * 100) : 0} color="bg-accent" />
            <UtilBar label="Checkpoint Success" pct={Math.round(metrics.checkpoint_success_rate * 100)} color="bg-state-running" />
            <UtilBar label="Active Runs" pct={metrics.total_runs > 0 ? Math.round((metrics.active_runs / metrics.total_runs) * 100) : 0} color="bg-accent" />
          </div>
        ) : (
          <div className="text-text-tertiary text-sm">No resource data available.</div>
        )}
      </div>
    </div>
  );
}

export default PerformancePage;
