import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../config/api';

interface LogLine {
  container: string;
  line: string;
}

const CONTAINER_COLORS: Record<string, string> = {
  'ckpt-worker-0': 'text-ok',
  'ckpt-worker-1': 'text-ok',
  'ckpt-controlplane': 'text-info',
  'ckpt-dataplane': 'text-recover',
  'ckpt-etcd': 'text-brand-violet',
  'ckpt-minio': 'text-warn',
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
  const [userScrolled, setUserScrolled] = useState(false);
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

  // Auto-scroll only when user hasn't scrolled up
  useEffect(() => {
    if (!userScrolled) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, userScrolled]);

  // Detect if user scrolled away from bottom
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolled(!atBottom);
  }, []);

  return (
    <div className="card overflow-hidden">
      <div className="panel-header">
        <span className="panel-tag">stdout</span>
        <h4 className="panel-title">Live Logs</h4>
        {active && lines.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
            <span className="text-2xs text-txt-3">streaming</span>
          </div>
        )}
      </div>

      <div className="px-3.5 py-2 border-b border-line-subtle">
        <p className="text-2xs text-txt-3 leading-relaxed">
          Real-time output from Docker containers. Look for{' '}
          <span className="text-txt-2 font-medium">checkpoint committed</span>,{' '}
          <span className="text-txt-2 font-medium">heartbeat timeout</span>, and{' '}
          <span className="text-txt-2 font-medium">restored from checkpoint</span> messages.
        </p>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="bg-surface-0 font-mono text-[11px] leading-relaxed max-h-72 overflow-y-auto p-2.5 space-y-px"
      >
        {lines.length === 0 ? (
          <div className="text-txt-3 text-center py-6">
            Waiting for log output...
          </div>
        ) : (
          lines.map((l, i) => {
            const color = CONTAINER_COLORS[l.container] ?? 'text-txt-3';
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
                <span className={`text-txt-3 break-all ${bold ? 'text-txt-1 font-medium' : ''}`}>
                  {l.line}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button when user has scrolled up */}
      {userScrolled && lines.length > 0 && (
        <button
          onClick={() => {
            setUserScrolled(false);
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="w-full py-1.5 text-2xs text-brand-violet bg-surface-2 hover:bg-surface-3 border-t border-line-subtle transition-colors cursor-pointer"
        >
          Scroll to latest logs
        </button>
      )}
    </div>
  );
}
