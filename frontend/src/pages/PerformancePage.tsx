import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { MetricsSummary } from '../types';

// ── Mock time-series generators (since API has no time-series endpoint) ──────

function generateLatencyData() {
  const now = Date.now();
  return Array.from({ length: 30 }, (_, i) => {
    const t = new Date(now - (29 - i) * 60_000);
    return {
      time: t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      save: 2.5 + Math.sin(i * 0.4) * 0.8 + Math.random() * 0.5,
      restore: 1.2 + Math.sin(i * 0.3 + 1) * 0.4 + Math.random() * 0.3,
    };
  });
}

function generateThroughputData() {
  return Array.from({ length: 12 }, (_, i) => {
    const t = new Date(Date.now() - (11 - i) * 300_000);
    return {
      time: t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      throughput: 3.0 + Math.random() * 2.5,
    };
  });
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics/summary');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setMetrics(await res.json());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const id = setInterval(fetchMetrics, 10000);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  const latencyData = useMemo(generateLatencyData, []);
  const throughputData = useMemo(generateThroughputData, []);

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-500 text-sm">Loading metrics...</div>;
  }

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
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={latencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#374151" />
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
      </div>

      {/* Throughput chart */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Throughput (GB/s)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={throughputData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#374151" />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#374151" unit=" GB/s" />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="throughput" name="Throughput" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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

      {/* Resource utilisation */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Resource Utilization</h3>
        <div className="space-y-4">
          <UtilBar label="CPU Usage"    pct={45} color="bg-indigo-500" />
          <UtilBar label="Memory"       pct={68} color="bg-indigo-500" />
          <UtilBar label="GPU Memory"   pct={72} color="bg-indigo-500" />
          <UtilBar label="Network I/O"  pct={32} color="bg-indigo-500" />
          <UtilBar label="Disk I/O"     pct={28} color="bg-indigo-500" />
        </div>
      </div>
    </div>
  );
}

export default PerformancePage;
