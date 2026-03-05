import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { RunStatus, RunState, CheckpointInfo, CheckpointState, RunEvent } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATE_STYLES: Record<RunState, string> = {
  CREATED:       'bg-gray-700/50 text-gray-300',
  RUNNING:       'bg-green-900/50 text-green-400',
  CHECKPOINTING: 'bg-yellow-900/50 text-yellow-400',
  COMMITTED:     'bg-blue-900/50 text-blue-400',
  FAILED:        'bg-red-900/50 text-red-400',
  RECOVERING:    'bg-orange-900/50 text-orange-400',
  CANCELLED:     'bg-gray-700/50 text-gray-400',
  COMPLETED:     'bg-blue-900/50 text-blue-400',
};

const CKPT_STATE_STYLES: Record<CheckpointState, string> = {
  PENDING:     'bg-gray-700/50 text-gray-300',
  IN_PROGRESS: 'bg-yellow-900/50 text-yellow-400',
  COMMITTED:   'bg-green-900/50 text-green-400',
  FAILED:      'bg-red-900/50 text-red-400',
};

function StateBadge({ state, large }: { state: RunState; large?: boolean }) {
  const size = large ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${size} ${STATE_STYLES[state] ?? 'bg-gray-700/50 text-gray-300'}`}>
      {state}
    </span>
  );
}

function CkptBadge({ state }: { state: CheckpointState }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CKPT_STATE_STYLES[state] ?? 'bg-gray-700/50 text-gray-300'}`}>
      {state}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ── Component ────────────────────────────────────────────────────────────────

function RunDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [run, setRun] = useState<RunStatus | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eventsEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch run + checkpoints ─────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [runRes, ckptRes] = await Promise.all([
        fetch(`/api/runs/${id}`),
        fetch(`/api/runs/${id}/checkpoints`),
      ]);
      if (!runRes.ok) throw new Error(`Run: ${runRes.status}`);
      if (!ckptRes.ok) throw new Error(`Checkpoints: ${ckptRes.status}`);
      setRun(await runRes.json());
      setCheckpoints(await ckptRes.json());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── SSE event stream ───────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`/api/runs/${id}/events`);

    es.onmessage = (evt) => {
      const event: RunEvent = {
        type: 'message',
        data: evt.data,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev.slice(-199), event]);
    };

    es.addEventListener('state_change', (evt) => {
      const event: RunEvent = {
        type: 'state_change',
        data: (evt as MessageEvent).data,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev.slice(-199), event]);
      fetchData(); // re-fetch on state change
    });

    es.addEventListener('checkpoint', (evt) => {
      const event: RunEvent = {
        type: 'checkpoint',
        data: (evt as MessageEvent).data,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev.slice(-199), event]);
      fetchData();
    });

    es.addEventListener('error_event', (evt) => {
      const event: RunEvent = {
        type: 'error',
        data: (evt as MessageEvent).data,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev.slice(-199), event]);
    });

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => es.close();
  }, [id, fetchData]);

  // Auto-scroll events
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  // ── Actions ────────────────────────────────────────────────────────────

  const postAction = async (action: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/runs/${id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      fetchData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Action failed');
    }
  };

  // ── Derived values ────────────────────────────────────────────────────

  const totalBytes = checkpoints.reduce((s, c) => s + c.total_bytes, 0);
  const committedCount = checkpoints.filter((c) => c.state === 'COMMITTED').length;

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-500 text-sm">Loading run details...</div>;
  }

  if (error && !run) {
    return (
      <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-4 py-3">
        {error}
      </div>
    );
  }

  if (!run) return null;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-gray-500">
        <Link to="/" className="hover:text-indigo-400 transition-colors">Runs</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-300 font-medium">{run.name || run.run_id}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-100">{run.name || 'Unnamed Run'}</h2>
            <StateBadge state={run.state} large />
          </div>
          <p className="mt-1 text-sm text-gray-500 font-mono">{run.run_id}</p>
          {run.error_message && (
            <p className="mt-2 text-sm text-red-400 bg-red-900/20 border border-red-900 rounded px-3 py-1.5">
              {run.error_message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(run.state === 'RUNNING' || run.state === 'CHECKPOINTING') && (
            <button
              onClick={() => postAction('checkpoint')}
              className="px-4 py-2 text-sm font-medium rounded-md bg-yellow-900/50 text-yellow-400 hover:bg-yellow-900/80 transition-colors"
            >
              Trigger Checkpoint
            </button>
          )}
          {(run.state === 'FAILED' || run.state === 'CANCELLED') && (
            <button
              onClick={() => postAction('resume')}
              className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
            >
              Resume
            </button>
          )}
          {(run.state === 'CREATED' || run.state === 'COMMITTED') && (
            <button
              onClick={() => postAction('start')}
              className="px-4 py-2 text-sm font-medium rounded-md bg-green-900/50 text-green-400 hover:bg-green-900/80 transition-colors"
            >
              Start
            </button>
          )}
          {(run.state === 'RUNNING' || run.state === 'CHECKPOINTING' || run.state === 'RECOVERING') && (
            <button
              onClick={() => postAction('cancel')}
              className="px-4 py-2 text-sm font-medium rounded-md bg-red-900/50 text-red-400 hover:bg-red-900/80 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Current Step</p>
          <p className="text-2xl font-bold text-gray-100 mt-1 font-mono">{run.current_step.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Active Workers</p>
          <p className="text-2xl font-bold text-gray-100 mt-1">{run.active_workers}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Checkpoints</p>
          <p className="text-2xl font-bold text-gray-100 mt-1">{committedCount} / {checkpoints.length}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Total Size</p>
          <p className="text-2xl font-bold text-gray-100 mt-1">{formatBytes(totalBytes)}</p>
        </div>
      </div>

      {/* Checkpoint history */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-gray-100">Checkpoint History</h3>
        </div>
        {checkpoints.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">No checkpoints yet.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Checkpoint ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Step</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">State</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Shards</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Size</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {checkpoints.map((ckpt) => (
                <tr key={ckpt.checkpoint_id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                    {ckpt.checkpoint_id.length > 16 ? ckpt.checkpoint_id.slice(0, 16) + '\u2026' : ckpt.checkpoint_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                    {ckpt.step.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <CkptBadge state={ckpt.state} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {ckpt.num_shards}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {formatBytes(ckpt.total_bytes)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(ckpt.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* SSE Event Stream */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-100">Event Stream</h3>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Live
          </div>
        </div>
        <div className="h-64 overflow-y-auto font-mono text-xs p-4 space-y-1 bg-gray-950">
          {events.length === 0 && (
            <p className="text-gray-600">Waiting for events...</p>
          )}
          {events.map((evt, i) => {
            const typeColor =
              evt.type === 'error' ? 'text-red-400' :
              evt.type === 'state_change' ? 'text-yellow-400' :
              evt.type === 'checkpoint' ? 'text-blue-400' :
              'text-gray-400';

            return (
              <div key={i} className="flex gap-3">
                <span className="text-gray-600 shrink-0">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 uppercase font-medium ${typeColor}`}>
                  [{evt.type}]
                </span>
                <span className="text-gray-300 break-all">{evt.data}</span>
              </div>
            );
          })}
          <div ref={eventsEndRef} />
        </div>
      </div>
    </div>
  );
}

export default RunDetailPage;
