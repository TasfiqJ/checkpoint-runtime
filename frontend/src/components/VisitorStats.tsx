import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../config/api';

interface CountryInfo {
  country: string;
  country_code: string;
  flag: string;
  count: number;
}

interface VisitorData {
  session_id: string;
  total_visitors: number;
  countries: CountryInfo[];
  activity: ActivityItem[];
}

interface ActivityItem {
  message: string;
  flag: string;
  timestamp: number;
}

const SESSION_KEY = 'ckpt_visitor_session';

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export default function VisitorStats() {
  const [data, setData] = useState<VisitorData | null>(null);
  const sessionRef = useRef(getSessionId());

  const ping = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/demo/visitors/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionRef.current }),
      });
      if (res.ok) {
        const d: VisitorData = await res.json();
        sessionRef.current = d.session_id;
        sessionStorage.setItem(SESSION_KEY, d.session_id);
        setData(d);
      }
    } catch { /* offline / no backend */ }
  }, []);

  useEffect(() => {
    ping();
    const id = setInterval(ping, 15000);
    return () => clearInterval(id);
  }, [ping]);

  if (!data) return null;

  return (
    <div className="card overflow-hidden">
      <div className="panel-header">
        <span className="panel-tag">live</span>
        <h4 className="panel-title">Watching Now</h4>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
          <span className="text-sm font-mono font-semibold text-txt-1">
            {data.total_visitors}
          </span>
        </span>
      </div>

      {data.countries.length > 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-1.5">
          {data.countries.map((c) => (
            <span
              key={c.country_code}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-surface-3 rounded text-[11px] text-txt-2"
              title={`${c.country}: ${c.count}`}
            >
              <span className="text-sm">{c.flag}</span>
              {c.count > 1 && (
                <span className="text-2xs text-txt-3">{c.count}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
