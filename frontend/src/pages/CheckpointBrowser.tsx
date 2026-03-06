import { useState, useEffect, useCallback } from 'react';
import type { RunStatus, CheckpointInfo, CheckpointState } from '../types';
import { API_BASE } from '../config/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

const CKPT_STATE_STYLES: Record<CheckpointState, string> = {
  PENDING:     'bg-gray-700/50 text-gray-300',
  IN_PROGRESS: 'bg-yellow-900/50 text-yellow-400',
  COMMITTED:   'bg-green-900/50 text-green-400',
  FAILED:      'bg-red-900/50 text-red-400',
};

function CkptBadge({ state }: { state: CheckpointState }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CKPT_STATE_STYLES[state] ?? 'bg-gray-700/50 text-gray-300'}`}>
      {state}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// ── Expandable row ───────────────────────────────────────────────────────────

function CheckpointRow({ ckpt }: { ckpt: CheckpointInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-gray-800/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
          <span className="inline-block w-4 text-gray-600 mr-1">{expanded ? '\u25BE' : '\u25B8'}</span>
          <span className="font-mono text-gray-300">
            {ckpt.checkpoint_id.length > 16 ? ckpt.checkpoint_id.slice(0, 16) + '\u2026' : ckpt.checkpoint_id}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{ckpt.run_id.slice(0, 12)}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{ckpt.step.toLocaleString()}</td>
        <td className="px-6 py-4 whitespace-nowrap"><CkptBadge state={ckpt.state} /></td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{ckpt.num_shards}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{formatBytes(ckpt.total_bytes)}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(ckpt.created_at)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="px-6 py-4 bg-gray-950">
            <div className="pl-5">
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Shard Details ({ckpt.shard_ids.length} shards)
              </h4>
              {ckpt.shard_ids.length === 0 ? (
                <p className="text-sm text-gray-600">No shard data available.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ckpt.shard_ids.map((shardId, idx) => (
                    <div
                      key={shardId}
                      className="bg-gray-900 border border-gray-800 rounded px-3 py-2 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-mono text-gray-300">{shardId.length > 20 ? shardId.slice(0, 20) + '\u2026' : shardId}</p>
                        <p className="text-xs text-gray-500">Shard {idx}</p>
                      </div>
                      <span className="text-xs text-gray-500">
                        ~{formatBytes(ckpt.total_bytes / Math.max(ckpt.num_shards, 1))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

function CheckpointBrowser() {
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      // First get all runs, then fetch checkpoints for each
      const runsRes = await fetch(`${API_BASE}/api/runs`);
      if (!runsRes.ok) throw new Error(`Runs: ${runsRes.status}`);
      const runs: RunStatus[] = await runsRes.json();

      const ckptPromises = runs.map(async (r) => {
        try {
          const res = await fetch(`${API_BASE}/api/runs/${r.run_id}/checkpoints`);
          if (!res.ok) return [];
          return (await res.json()) as CheckpointInfo[];
        } catch {
          return [];
        }
      });

      const allCkpts = (await Promise.all(ckptPromises)).flat();
      // Sort by created_at descending
      allCkpts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setCheckpoints(allCkpts);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 10000);
    return () => clearInterval(id);
  }, [fetchAll]);

  // Summary stats
  const totalBytes = checkpoints.reduce((s, c) => s + c.total_bytes, 0);
  const committedCount = checkpoints.filter((c) => c.state === 'COMMITTED').length;
  const totalShards = checkpoints.reduce((s, c) => s + c.num_shards, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-100">Checkpoint Browser</h2>
        <p className="mt-1 text-sm text-gray-400">
          Browse and inspect checkpoints across all training runs. Click a row to expand shard details.
        </p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Total Checkpoints</p>
          <p className="text-2xl font-bold text-gray-100 mt-1">{checkpoints.length}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Committed</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{committedCount}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Total Shards</p>
          <p className="text-2xl font-bold text-gray-100 mt-1">{totalShards}</p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Total Storage</p>
          <p className="text-2xl font-bold text-gray-100 mt-1">{formatBytes(totalBytes)}</p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
          Loading checkpoints...
        </div>
      )}

      {/* Empty */}
      {!loading && checkpoints.length === 0 && !error && (
        <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
          No checkpoints found across any run.
        </div>
      )}

      {/* Table */}
      {!loading && checkpoints.length > 0 && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Checkpoint ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Run</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Step</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">State</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Shards</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Size</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {checkpoints.map((ckpt) => (
                <CheckpointRow key={ckpt.checkpoint_id} ckpt={ckpt} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CheckpointBrowser;
