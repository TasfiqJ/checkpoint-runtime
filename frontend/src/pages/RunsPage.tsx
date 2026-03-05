import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { RunStatus, RunState, RunConfig } from '../types';

// ── State badge colour map ───────────────────────────────────────────────────

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

function StateBadge({ state }: { state: RunState }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATE_STYLES[state] ?? 'bg-gray-700/50 text-gray-300'}`}>
      {state}
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) + '\u2026' : id;
}

// ── New-run modal ────────────────────────────────────────────────────────────

function NewRunModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<RunConfig>({ name: '', num_workers: 4, checkpoint_interval_steps: 1000 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/runs', {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Create New Run</h3>

        {error && <div className="mb-3 text-sm text-red-400 bg-red-900/30 border border-red-800 rounded px-3 py-2">{error}</div>}

        <label className="block mb-3">
          <span className="text-sm text-gray-400">Run Name</span>
          <input
            type="text"
            className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="my-training-run"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm text-gray-400">Number of Workers</span>
          <input
            type="number"
            min={1}
            className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            value={form.num_workers}
            onChange={(e) => setForm({ ...form, num_workers: parseInt(e.target.value) || 1 })}
          />
        </label>

        <label className="block mb-5">
          <span className="text-sm text-gray-400">Checkpoint Interval (steps)</span>
          <input
            type="number"
            min={1}
            className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            value={form.checkpoint_interval_steps}
            onChange={(e) => setForm({ ...form, checkpoint_interval_steps: parseInt(e.target.value) || 100 })}
          />
        </label>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Cancel
          </button>
          <button
            disabled={submitting || !form.name.trim()}
            onClick={submit}
            className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Creating\u2026' : 'Create Run'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

function RunsPage() {
  const [runs, setRuns] = useState<RunStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewRun, setShowNewRun] = useState(false);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/runs');
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

  // Initial load + polling every 5s
  useEffect(() => {
    fetchRuns();
    const id = setInterval(fetchRuns, 5000);
    return () => clearInterval(id);
  }, [fetchRuns]);

  // Action helpers
  const postAction = async (runId: string, action: 'start' | 'cancel') => {
    try {
      const res = await fetch(`/api/runs/${runId}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      fetchRuns();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Action failed');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Training Runs</h2>
          <p className="mt-1 text-sm text-gray-400">
            Manage training runs and monitor checkpoint progress.
          </p>
        </div>
        <button
          onClick={() => setShowNewRun(true)}
          className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
        >
          + New Run
        </button>
      </div>

      {showNewRun && <NewRunModal onClose={() => setShowNewRun(false)} onCreated={fetchRuns} />}

      {/* Error */}
      {error && (
        <div className="mb-4 text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
          Loading runs...
        </div>
      )}

      {/* Empty state */}
      {!loading && runs.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-sm">No training runs found.</p>
          <button
            onClick={() => setShowNewRun(true)}
            className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Create your first run
          </button>
        </div>
      )}

      {/* Runs table */}
      {!loading && runs.length > 0 && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Run ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">State</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Step</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Workers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {runs.map((run) => (
                <tr key={run.run_id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Link to={`/runs/${run.run_id}`} className="text-indigo-400 hover:text-indigo-300 font-medium">
                      {run.name || '(unnamed)'}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                    {shortId(run.run_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StateBadge state={run.state} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                    {run.current_step.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {run.active_workers}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(run.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(run.state === 'CREATED' || run.state === 'COMMITTED') && (
                        <button
                          onClick={() => postAction(run.run_id, 'start')}
                          className="px-3 py-1 text-xs font-medium rounded bg-green-900/50 text-green-400 hover:bg-green-900/80 transition-colors"
                        >
                          Start
                        </button>
                      )}
                      {(run.state === 'RUNNING' || run.state === 'CHECKPOINTING' || run.state === 'RECOVERING') && (
                        <button
                          onClick={() => postAction(run.run_id, 'cancel')}
                          className="px-3 py-1 text-xs font-medium rounded bg-red-900/50 text-red-400 hover:bg-red-900/80 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      <Link
                        to={`/runs/${run.run_id}`}
                        className="px-3 py-1 text-xs font-medium rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default RunsPage;
