import { useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { API_BASE } from '../config/api';
import { formatBytes } from '../design';

interface StorageFile {
  key: string;
  size: number;
  modified: string;
}

interface StorageData {
  files: StorageFile[];
  total_bytes: number;
}

function buildTree(files: StorageFile[]): Map<string, Map<string, StorageFile[]>> {
  const tree = new Map<string, Map<string, StorageFile[]>>();
  for (const f of files) {
    const parts = f.key.split('/');
    const runId = parts[0] || 'unknown';
    const cpId = parts[1] || 'root';
    if (!tree.has(runId)) tree.set(runId, new Map());
    const run = tree.get(runId)!;
    if (!run.has(cpId)) run.set(cpId, []);
    run.get(cpId)!.push(f);
  }
  return tree;
}

export default function StorageBrowser({ active }: { active: boolean }) {
  const { data } = usePolling<StorageData>(
    `${API_BASE}/api/demo/storage`,
    active ? 5000 : 60000,
  );
  const [expandedManifest, setExpandedManifest] = useState<string | null>(null);
  const [manifestContent, setManifestContent] = useState<object | null>(null);

  const files = data?.files ?? [];
  const tree = buildTree(files);

  const handleManifestClick = async (key: string) => {
    if (expandedManifest === key) {
      setExpandedManifest(null);
      return;
    }
    setExpandedManifest(key);
    try {
      const res = await fetch(`${API_BASE}/api/demo/storage/manifest?key=${encodeURIComponent(key)}`);
      if (res.ok) setManifestContent(await res.json());
    } catch {
      setManifestContent({ error: 'Failed to load manifest' });
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="panel-header">
        <span className="panel-tag">s3://</span>
        <h4 className="panel-title">Object Storage</h4>
        {data && (
          <span className="ml-auto text-2xs text-text-tertiary">
            {files.length} files &middot; {formatBytes(data.total_bytes)}
          </span>
        )}
      </div>

      <div className="font-mono text-[11px] max-h-72 overflow-y-auto p-2.5">
        {files.length === 0 ? (
          <div className="text-text-tertiary text-center py-6">
            No checkpoint files yet...
          </div>
        ) : (
          <div className="space-y-0.5">
            {Array.from(tree.entries()).map(([runId, checkpoints]) => (
              <div key={runId}>
                <div className="text-state-committed flex items-center gap-1">
                  <span className="text-text-tertiary">checkpoints/</span>
                  {runId.slice(0, 12)}/
                </div>
                {Array.from(checkpoints.entries()).map(([cpId, cpFiles]) => (
                  <div key={cpId} className="ml-4">
                    <div className="text-accent">
                      {cpId.slice(0, 12)}/
                    </div>
                    {cpFiles.map((f) => {
                      const fileName = f.key.split('/').pop() || f.key;
                      const isManifest = fileName.endsWith('_manifest.json');
                      return (
                        <div key={f.key} className="ml-4">
                          <div className="flex items-center gap-2">
                            {isManifest ? (
                              <button
                                onClick={() => handleManifestClick(f.key)}
                                className="text-state-checkpoint hover:text-state-checkpoint/80 hover:underline cursor-pointer"
                              >
                                {fileName}
                              </button>
                            ) : (
                              <span className={
                                fileName.endsWith('.bin')
                                  ? 'text-state-running'
                                  : 'text-text-tertiary'
                              }>
                                {fileName}
                              </span>
                            )}
                            <span className="text-text-tertiary/60">
                              ({formatBytes(f.size)})
                            </span>
                          </div>
                          {isManifest && expandedManifest === f.key && manifestContent && (
                            <pre className="ml-2 mt-1 mb-2 p-2 bg-surface-0 border border-border rounded text-[10px] text-text-tertiary overflow-x-auto max-w-full">
                              {JSON.stringify(manifestContent, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
