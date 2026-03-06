import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { MetricsSummary } from '../types';
import { API_BASE } from '../config/api';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ── Utilisation bar ──────────────────────────────────────────────────────────

function UtilBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const barColor = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : color;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-500">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
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
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value.toFixed(2)}
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

      if (perfRes.ok) {
        setPerfData(await perfRes.json());
      }
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

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-500 text-sm">Loading metrics...</div>;
  }

  const latencyData = perfData?.latency ?? [];
  const hasLatencyData = latencyData.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-100">Performance Metrics</h2>
        <p className="mt-1 text-sm text-gray-400">
          Checkpoint save/restore throughput, latency, and resource utilization.
        </p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Key metric cards */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <p className="text-xs text-gray-400">Total Runs</p>
            <p className="text-2xl font-bold text-gray-100 mt-1">{metrics.total_runs}</p>
          </div>
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <p className="text-xs text-gray-400">Active Runs</p>
            <p className="text-2xl font-bold text-indigo-400 mt-1">{metrics.active_runs}</p>
          </div>
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <p className="text-xs text-gray-400">Total Checkpoints</p>
            <p className="text-2xl font-bold text-gray-100 mt-1">{metrics.total_checkpoints}</p>
          </div>
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <p className="text-xs text-gray-400">Checkpoint Size</p>
            <p className="text-2xl font-bold text-gray-100 mt-1">{formatBytes(metrics.total_checkpoint_bytes)}</p>
          </div>
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <p className="text-xs text-gray-400">Active Workers</p>
            <p className="text-2xl font-bold text-gray-100 mt-1">
              {metrics.active_workers} / {metrics.total_workers}
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <p className="text-xs text-gray-400">Success Rate</p>
            <p className={`text-2xl font-bold mt-1 ${metrics.checkpoint_success_rate >= 0.95 ? 'text-green-400' : metrics.checkpoint_success_rate >= 0.8 ? 'text-yellow-400' : 'text-red-400'}`}>
              {(metrics.checkpoint_success_rate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Latency chart */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Checkpoint Latency Over Time</h3>
        {hasLatencyData ? (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latencyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="index" tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#374151" />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#374151" unit="s" />
                  <Tooltip content={<DarkTooltip />} />
                  <Line type="monotone" dataKey="save" name="Save" stroke="#818cf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="restore" name="Restore" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-indigo-400 inline-block rounded" /> Save Latency
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-green-400 inline-block rounded" /> Restore Latency
              </span>
            </div>
          </>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
            No checkpoint latency data yet. Trigger a checkpoint to see metrics.
          </div>
        )}
      </div>

      {/* Throughput info */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Throughput</h3>
        {perfData && perfData.checkpoint_count > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">Total Data Written</p>
              <p className="text-2xl font-bold text-gray-100 mt-1">{formatBytes(perfData.total_checkpoint_bytes)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Checkpoints Completed</p>
              <p className="text-2xl font-bold text-gray-100 mt-1">{perfData.checkpoint_count}</p>
            </div>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-gray-500 text-sm">
            No throughput data yet. Complete a checkpoint cycle to see metrics.
          </div>
        )}
      </div>

      {/* External links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <a
          href="http://localhost:3001"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-gray-900 rounded-lg border border-gray-800 p-5 hover:border-indigo-700 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-100 group-hover:text-indigo-400 transition-colors">
                Grafana Dashboards
              </h4>
              <p className="text-xs text-gray-500 mt-1">Full metrics dashboards with custom panels</p>
            </div>
            <span className="text-gray-600 group-hover:text-indigo-400 transition-colors">&rarr;</span>
          </div>
          <p className="text-xs text-gray-600 font-mono mt-2">localhost:3001</p>
        </a>
        <a
          href="http://localhost:16686"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-gray-900 rounded-lg border border-gray-800 p-5 hover:border-indigo-700 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-100 group-hover:text-indigo-400 transition-colors">
                Jaeger Tracing
              </h4>
              <p className="text-xs text-gray-500 mt-1">Distributed trace viewer for checkpoint operations</p>
            </div>
            <span className="text-gray-600 group-hover:text-indigo-400 transition-colors">&rarr;</span>
          </div>
          <p className="text-xs text-gray-600 font-mono mt-2">localhost:16686</p>
        </a>
      </div>

      {/* Resource utilisation — from metrics summary */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Resource Utilization</h3>
        {metrics ? (
          <div className="space-y-4">
            <UtilBar label="Workers Active" pct={metrics.total_workers > 0 ? Math.round((metrics.active_workers / metrics.total_workers) * 100) : 0} color="bg-indigo-500" />
            <UtilBar label="Checkpoint Success" pct={Math.round(metrics.checkpoint_success_rate * 100)} color="bg-green-500" />
            <UtilBar label="Active Runs" pct={metrics.total_runs > 0 ? Math.round((metrics.active_runs / metrics.total_runs) * 100) : 0} color="bg-indigo-500" />
          </div>
        ) : (
          <div className="text-gray-500 text-sm">No resource data available.</div>
        )}
      </div>
    </div>
  );
}

export default PerformancePage;
