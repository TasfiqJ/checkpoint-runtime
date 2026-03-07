import { useState, useEffect, useCallback } from 'react';
import type { RunStatus, CheckpointInfo } from '../types';
import { API_BASE } from '../config/api';
import { formatBytes, formatDate, shortId } from '../design';
import { CkptBadge, SectionHeader, MetricCard, ErrorBanner, Loading, EmptyState } from '../components/ui';

// ── Expandable row ───────────────────────────────────────────────────────────

function CheckpointRow({ ckpt }: { ckpt: CheckpointInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-surface-2/50 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="table-cell text-text-tertiary">
          <span className="inline-block w-4 text-text-tertiary/50 mr-1">{expanded ? '\u25BE' : '\u25B8'}</span>
          <span className="font-mono text-text-secondary text-xs">
            {shortId(ckpt.checkpoint_id, 16)}
          </span>
        </td>
        <td className="table-cell text-text-tertiary font-mono text-xs">{ckpt.run_id.slice(0, 12)}</td>
        <td className="table-cell text-text-secondary font-mono">{ckpt.step.toLocaleString()}</td>
        <td className="table-cell"><CkptBadge state={ckpt.state} /></td>
        <td className="table-cell text-text-secondary">{ckpt.num_shards}</td>
        <td className="table-cell text-text-secondary">{formatBytes(ckpt.total_bytes)}</td>
        <td className="table-cell text-text-tertiary text-xs">{formatDate(ckpt.created_at)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="px-4 py-4 bg-surface-0">
            <div className="pl-5">
              <h4 className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mb-2.5">
                Shard Details ({ckpt.shard_ids.length} shards)
              </h4>
              {ckpt.shard_ids.length === 0 ? (
                <p className="text-sm text-text-tertiary">No shard data available.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ckpt.shard_ids.map((shardId, idx) => (
                    <div
                      key={shardId}
                      className="bg-surface-2 border border-border rounded-lg px-3 py-2 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-mono text-text-secondary">{shortId(shardId, 20)}</p>
                        <p className="text-2xs text-text-tertiary">Shard {idx}</p>
                      </div>
                      <span className="text-2xs text-text-tertiary">
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
      const runsRes = await fetch(`${API_BASE}/api/runs`);
      if (!runsRes.ok) throw new Error(`Runs: ${runsRes.status}`);
      const runs: RunStatus[] = await runsRes.json();

      const ckptPromises = runs.map(async (r) => {
        try {
          const res = await fetch(`${API_BASE}/api/runs/${r.run_id}/checkpoints`);
          if (!res.ok) return [];
          return (await res.json()) as CheckpointInfo[];
        } catch { return []; }
      });

      const allCkpts = (await Promise.all(ckptPromises)).flat();
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

  const totalBytes = checkpoints.reduce((s, c) => s + c.total_bytes, 0);
  const committedCount = checkpoints.filter((c) => c.state === 'COMMITTED').length;
  const totalShards = checkpoints.reduce((s, c) => s + c.num_shards, 0);

  return (
    <div>
      <SectionHeader
        title="Checkpoint Browser"
        subtitle="Browse and inspect checkpoints across all training runs."
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Total Checkpoints" value={checkpoints.length} />
        <MetricCard label="Committed" value={committedCount} valueColor="text-state-running" />
        <MetricCard label="Total Shards" value={totalShards} />
        <MetricCard label="Total Storage" value={formatBytes(totalBytes)} />
      </div>

      {loading && <Loading text="Loading checkpoints..." />}

      {!loading && checkpoints.length === 0 && !error && (
        <EmptyState message="No checkpoints found across any run." />
      )}

      {!loading && checkpoints.length > 0 && (
        <div className="card overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header">Checkpoint ID</th>
                <th className="table-header">Run</th>
                <th className="table-header">Step</th>
                <th className="table-header">State</th>
                <th className="table-header">Shards</th>
                <th className="table-header">Size</th>
                <th className="table-header">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
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
