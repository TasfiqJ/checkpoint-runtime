import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { RunStatus, CheckpointInfo, RunEvent } from '../types';
import { API_BASE } from '../config/api';
import { formatBytes, formatDate } from '../design';
import { RunBadge, CkptBadge, MetricCard, ErrorBanner, Loading, LiveDot } from '../components/ui';

function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<RunStatus | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [runRes, ckptRes] = await Promise.all([
        fetch(`${API_BASE}/api/runs/${id}`),
        fetch(`${API_BASE}/api/runs/${id}/checkpoints`),
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

  // SSE event stream
  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`${API_BASE}/api/runs/${id}/events`);

    es.onmessage = (evt) => {
      setEvents((prev) => [...prev.slice(-199), {
        type: 'message', data: evt.data, timestamp: new Date().toISOString(),
      }]);
    };
    es.addEventListener('state_change', (evt) => {
      setEvents((prev) => [...prev.slice(-199), {
        type: 'state_change', data: (evt as MessageEvent).data, timestamp: new Date().toISOString(),
      }]);
      fetchData();
    });
    es.addEventListener('checkpoint', (evt) => {
      setEvents((prev) => [...prev.slice(-199), {
        type: 'checkpoint', data: (evt as MessageEvent).data, timestamp: new Date().toISOString(),
      }]);
      fetchData();
    });
    es.addEventListener('error_event', (evt) => {
      setEvents((prev) => [...prev.slice(-199), {
        type: 'error', data: (evt as MessageEvent).data, timestamp: new Date().toISOString(),
      }]);
    });
    es.onerror = () => {};
    return () => es.close();
  }, [id, fetchData]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const postAction = async (action: string) => {
    if (!id) return;
    try {
      const res = await fetch(`${API_BASE}/api/runs/${id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      fetchData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const totalBytes = checkpoints.reduce((s, c) => s + c.total_bytes, 0);
  const committedCount = checkpoints.filter((c) => c.state === 'COMMITTED').length;

  if (loading) return <Loading text="Loading run details..." />;
  if (error && !run) return <ErrorBanner message={error} />;
  if (!run) return null;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-xs text-text-tertiary">
        <Link to="/runs" className="hover:text-accent transition-colors">Runs</Link>
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5l3 3.5-3 3.5" stroke="currentColor" strokeWidth="1.2" /></svg>
        <span className="text-text-secondary font-medium">{run.name || run.run_id.slice(0, 12)}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="page-header">{run.name || 'Unnamed Run'}</h2>
            <RunBadge state={run.state} size="md" />
          </div>
          <p className="mt-1.5 text-xs text-text-tertiary font-mono">{run.run_id}</p>
          {run.error_message && (
            <p className="mt-2 text-sm text-state-failed bg-state-failed-muted border border-state-failed/20 rounded-lg px-3 py-1.5">
              {run.error_message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(run.state === 'RUNNING' || run.state === 'CHECKPOINTING') && (
            <button onClick={() => postAction('checkpoint')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-state-checkpoint-muted text-state-checkpoint hover:bg-state-checkpoint/20 transition-colors">
              Trigger Checkpoint
            </button>
          )}
          {(run.state === 'FAILED' || run.state === 'CANCELLED') && (
            <button onClick={() => postAction('resume')} className="btn-primary text-xs">Resume</button>
          )}
          {(run.state === 'CREATED' || run.state === 'COMMITTED') && (
            <button onClick={() => postAction('start')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-state-running-muted text-state-running hover:bg-state-running/20 transition-colors">
              Start
            </button>
          )}
          {(run.state === 'RUNNING' || run.state === 'CHECKPOINTING' || run.state === 'RECOVERING') && (
            <button onClick={() => postAction('cancel')} className="btn-danger">Cancel</button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Current Step" value={run.current_step.toLocaleString()} />
        <MetricCard label="Active Workers" value={run.active_workers} />
        <MetricCard label="Checkpoints" value={`${committedCount} / ${checkpoints.length}`} />
        <MetricCard label="Total Size" value={formatBytes(totalBytes)} />
      </div>

      {/* Checkpoint history */}
      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Checkpoint History</h3>
        </div>
        {checkpoints.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-text-tertiary">No checkpoints yet.</div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header">Checkpoint ID</th>
                <th className="table-header">Step</th>
                <th className="table-header">State</th>
                <th className="table-header">Shards</th>
                <th className="table-header">Size</th>
                <th className="table-header">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {checkpoints.map((ckpt) => (
                <tr key={ckpt.checkpoint_id} className="hover:bg-surface-2/50 transition-colors">
                  <td className="table-cell text-text-secondary font-mono text-xs">
                    {ckpt.checkpoint_id.length > 16 ? ckpt.checkpoint_id.slice(0, 16) + '\u2026' : ckpt.checkpoint_id}
                  </td>
                  <td className="table-cell text-text-secondary font-mono">{ckpt.step.toLocaleString()}</td>
                  <td className="table-cell"><CkptBadge state={ckpt.state} /></td>
                  <td className="table-cell text-text-secondary">{ckpt.num_shards}</td>
                  <td className="table-cell text-text-secondary">{formatBytes(ckpt.total_bytes)}</td>
                  <td className="table-cell text-text-tertiary text-xs">{formatDate(ckpt.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* SSE Event Stream */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Event Stream</h3>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <LiveDot />
            Live
          </div>
        </div>
        <div className="h-64 overflow-y-auto font-mono text-xs p-4 space-y-0.5 bg-surface-0">
          {events.length === 0 && (
            <p className="text-text-tertiary">Waiting for events...</p>
          )}
          {events.map((evt, i) => {
            const typeColor =
              evt.type === 'error' ? 'text-state-failed' :
              evt.type === 'state_change' ? 'text-state-checkpoint' :
              evt.type === 'checkpoint' ? 'text-state-committed' :
              'text-text-tertiary';
            return (
              <div key={i} className="flex gap-3">
                <span className="text-text-tertiary/60 shrink-0">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 uppercase font-medium ${typeColor}`}>
                  [{evt.type}]
                </span>
                <span className="text-text-secondary break-all">{evt.data}</span>
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
