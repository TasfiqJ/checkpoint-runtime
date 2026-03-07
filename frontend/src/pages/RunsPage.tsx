import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { RunStatus, RunConfig } from '../types';
import { API_BASE } from '../config/api';
import { RUN_STATE_CONFIG, formatDate, shortId } from '../design';
import { RunBadge, SectionHeader, ErrorBanner, Loading, EmptyState } from '../components/ui';

// -- New-run modal ----------------------------------------------------------

function NewRunModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<RunConfig>({ name: '', num_workers: 4, checkpoint_interval_steps: 1000 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      onCreated();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create run');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-txt-1 mb-5">Create New Run</h3>

        {error && (
          <div className="mb-4 text-sm text-err bg-err-muted border border-err/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <label className="block mb-4">
          <span className="text-xs font-medium text-txt-2">Run Name</span>
          <input
            type="text"
            className="mt-1.5 block w-full bg-surface-0 border border-line rounded-lg px-3 py-2 text-sm text-txt-1 placeholder-txt-3 focus:outline-none focus:ring-1 focus:ring-brand-violet focus:border-brand-violet transition-colors"
            placeholder="my-training-run"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>

        <label className="block mb-4">
          <span className="text-xs font-medium text-txt-2">Number of Workers</span>
          <input
            type="number"
            min={1}
            className="mt-1.5 block w-full bg-surface-0 border border-line rounded-lg px-3 py-2 text-sm text-txt-1 focus:outline-none focus:ring-1 focus:ring-brand-violet focus:border-brand-violet transition-colors"
            value={form.num_workers}
            onChange={(e) => setForm({ ...form, num_workers: parseInt(e.target.value) || 1 })}
          />
        </label>

        <label className="block mb-6">
          <span className="text-xs font-medium text-txt-2">Checkpoint Interval (steps)</span>
          <input
            type="number"
            min={1}
            className="mt-1.5 block w-full bg-surface-0 border border-line rounded-lg px-3 py-2 text-sm text-txt-1 focus:outline-none focus:ring-1 focus:ring-brand-violet focus:border-brand-violet transition-colors"
            value={form.checkpoint_interval_steps}
            onChange={(e) => setForm({ ...form, checkpoint_interval_steps: parseInt(e.target.value) || 100 })}
          />
        </label>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            disabled={submitting || !form.name.trim()}
            onClick={submit}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating\u2026' : 'Create Run'}
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Main page --------------------------------------------------------------

function RunsPage() {
  const [runs, setRuns] = useState<RunStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewRun, setShowNewRun] = useState(false);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/runs`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data: RunStatus[] = await res.json();
      setRuns(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
    const id = setInterval(fetchRuns, 5000);
    return () => clearInterval(id);
  }, [fetchRuns]);

  const postAction = async (runId: string, action: 'start' | 'cancel') => {
    try {
      const res = await fetch(`${API_BASE}/api/runs/${runId}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      fetchRuns();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Action failed');
    }
  };

  return (
    <div>
      <SectionHeader
        title="Training Runs"
        subtitle="Manage training runs and monitor checkpoint progress."
        action={
          <button onClick={() => setShowNewRun(true)} className="btn-primary">
            + New Run
          </button>
        }
      />

      {showNewRun && <NewRunModal onClose={() => setShowNewRun(false)} onCreated={fetchRuns} />}
      {error && <ErrorBanner message={error} />}
      {loading && <Loading text="Loading runs..." />}

      {!loading && runs.length === 0 && !error && (
        <EmptyState
          message="No training runs found."
          action={
            <button onClick={() => setShowNewRun(true)} className="text-sm text-brand-violet hover:text-brand-blue transition-colors">
              Create your first run
            </button>
          }
        />
      )}

      {!loading && runs.length > 0 && (
        <div className="card overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-line">
                <th className="table-header">Name</th>
                <th className="table-header">Run ID</th>
                <th className="table-header">State</th>
                <th className="table-header">Step</th>
                <th className="table-header">Workers</th>
                <th className="table-header">Created</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {runs.map((run) => {
                const stateConfig = RUN_STATE_CONFIG[run.state];
                return (
                  <tr key={run.run_id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="table-cell">
                      <Link to={`/runs/${run.run_id}`} className="text-brand-violet hover:text-brand-blue font-medium transition-colors">
                        {run.name || '(unnamed)'}
                      </Link>
                    </td>
                    <td className="table-cell text-txt-3 font-mono text-xs">
                      {shortId(run.run_id)}
                    </td>
                    <td className="table-cell">
                      <RunBadge state={run.state} />
                    </td>
                    <td className="table-cell text-txt-2 font-mono">
                      {run.current_step.toLocaleString()}
                    </td>
                    <td className="table-cell text-txt-2">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${stateConfig.dot}`} />
                        {run.active_workers}
                      </span>
                    </td>
                    <td className="table-cell text-txt-3 text-xs">
                      {formatDate(run.created_at)}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {(run.state === 'CREATED' || run.state === 'COMMITTED') && (
                          <button
                            onClick={() => postAction(run.run_id, 'start')}
                            className="px-2.5 py-1 text-2xs font-medium rounded-md bg-ok-muted text-ok hover:bg-ok/20 transition-colors"
                          >
                            Start
                          </button>
                        )}
                        {(run.state === 'RUNNING' || run.state === 'CHECKPOINTING' || run.state === 'RECOVERING') && (
                          <button
                            onClick={() => postAction(run.run_id, 'cancel')}
                            className="btn-danger text-2xs"
                          >
                            Cancel
                          </button>
                        )}
                        <Link
                          to={`/runs/${run.run_id}`}
                          className="px-2.5 py-1 text-2xs font-medium rounded-md bg-surface-3 text-txt-2 hover:text-txt-1 hover:bg-surface-3/80 transition-colors"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default RunsPage;
