import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config/api';

interface LogLine {
  container: string;
  line: string;
}

const CONTAINER_COLORS: Record<string, string> = {
  'ckpt-worker-0': 'text-green-400',
  'ckpt-worker-1': 'text-green-300',
  'ckpt-controlplane': 'text-blue-400',
  'ckpt-dataplane': 'text-orange-400',
  'ckpt-etcd': 'text-purple-400',
  'ckpt-minio': 'text-yellow-400',
};

const HIGHLIGHT_PATTERNS = [
  /checkpoint.*committed/i,
  /checkpoint saved/i,
  /heartbeat.*timeout/i,
  /FAILED|RECOVERING/,
  /restored from checkpoint/i,
  /step=\d+.*loss=/,
];

function isHighlighted(line: string): boolean {
  return HIGHLIGHT_PATTERNS.some((p) => p.test(line));
}

const MAX_LINES = 150;

export default function LogStream({ active }: { active: boolean }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;

    const containers = 'ckpt-worker-0,ckpt-worker-1,ckpt-controlplane,ckpt-dataplane';
    const es = new EventSource(`${API_BASE}/api/demo/logs?containers=${containers}&tail=20`);

    es.onmessage = (evt) => {
      try {
        const data: LogLine = JSON.parse(evt.data);
        setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), data]);
      } catch { /* skip malformed */ }
    };

    es.onerror = () => {};

    return () => es.close();
  }, [active]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
        <span className="text-[10px] font-mono bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">stdout</span>
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Live Logs
        </h4>
        {active && lines.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] text-gray-500">streaming</span>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="bg-black/40 font-mono text-[11px] leading-relaxed max-h-72 overflow-y-auto p-2 space-y-px"
      >
        {lines.length === 0 ? (
          <div className="text-gray-600 text-center py-6">
            Waiting for log output...
          </div>
        ) : (
          lines.map((l, i) => {
            const color = CONTAINER_COLORS[l.container] ?? 'text-gray-400';
            const bold = isHighlighted(l.line);
            // Short container label
            const label = l.container.replace('ckpt-', '');
            return (
              <div
                key={i}
                className={`flex gap-1.5 ${bold ? 'bg-gray-800/60 rounded px-1 -mx-1' : ''}`}
              >
                <span className={`${color} flex-shrink-0 w-[72px] truncate`}>
                  [{label}]
                </span>
                <span className={`text-gray-400 break-all ${bold ? 'text-gray-200 font-medium' : ''}`}>
                  {l.line}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
