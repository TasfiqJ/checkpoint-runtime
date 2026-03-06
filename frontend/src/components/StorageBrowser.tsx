import { useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { API_BASE } from '../config/api';

interface StorageFile {
  key: string;
  size: number;
  modified: string;
}

interface StorageData {
  files: StorageFile[];
  total_bytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Group files into a tree structure: run_id → checkpoint_id → files
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
        <span className="text-[10px] font-mono bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">s3://</span>
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Object Storage
        </h4>
        {data && (
          <span className="ml-auto text-[10px] text-gray-500">
            {files.length} files &middot; {formatBytes(data.total_bytes)}
          </span>
        )}
      </div>

      <div className="font-mono text-[11px] max-h-72 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="text-gray-600 text-center py-6">
            No checkpoint files yet...
          </div>
        ) : (
          <div className="space-y-0.5">
            {Array.from(tree.entries()).map(([runId, checkpoints]) => (
              <div key={runId}>
                <div className="text-blue-400 flex items-center gap-1">
                  <span className="text-gray-600">checkpoints/</span>
                  {runId.slice(0, 12)}/
                </div>
                {Array.from(checkpoints.entries()).map(([cpId, cpFiles]) => (
                  <div key={cpId} className="ml-4">
                    <div className="text-indigo-400">
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
                                className="text-yellow-400 hover:text-yellow-300 hover:underline cursor-pointer"
                              >
                                {fileName}
                              </button>
                            ) : (
                              <span className={
                                fileName.endsWith('.bin')
                                  ? 'text-green-400'
                                  : 'text-gray-400'
                              }>
                                {fileName}
                              </span>
                            )}
                            <span className="text-gray-600">
                              ({formatBytes(f.size)})
                            </span>
                          </div>
                          {isManifest && expandedManifest === f.key && manifestContent && (
                            <pre className="ml-2 mt-1 mb-2 p-2 bg-black/40 rounded text-[10px] text-gray-400 overflow-x-auto max-w-full">
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
