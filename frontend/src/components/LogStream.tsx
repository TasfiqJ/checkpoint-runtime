import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config/api';

interface LogLine {
  container: string;
  line: string;
}

const CONTAINER_COLORS: Record<string, string> = {
  'ckpt-worker-0': 'text-state-running',
  'ckpt-worker-1': 'text-emerald-300',
  'ckpt-controlplane': 'text-state-committed',
  'ckpt-dataplane': 'text-state-recovery',
  'ckpt-etcd': 'text-purple-400',
  'ckpt-minio': 'text-state-checkpoint',
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="card overflow-hidden">
      <div className="panel-header">
        <span className="panel-tag">stdout</span>
        <h4 className="panel-title">Live Logs</h4>
        {active && lines.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-state-running animate-pulse" />
            <span className="text-2xs text-text-tertiary">streaming</span>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="bg-surface-0 font-mono text-[11px] leading-relaxed max-h-72 overflow-y-auto p-2.5 space-y-px"
      >
        {lines.length === 0 ? (
          <div className="text-text-tertiary text-center py-6">
            Waiting for log output...
          </div>
        ) : (
          lines.map((l, i) => {
            const color = CONTAINER_COLORS[l.container] ?? 'text-text-tertiary';
            const bold = isHighlighted(l.line);
            const label = l.container.replace('ckpt-', '');
            return (
              <div
                key={i}
                className={`flex gap-1.5 ${bold ? 'bg-surface-2 rounded px-1 -mx-1' : ''}`}
              >
                <span className={`${color} flex-shrink-0 w-[72px] truncate`}>
                  [{label}]
                </span>
                <span className={`text-text-tertiary break-all ${bold ? 'text-text-primary font-medium' : ''}`}>
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
