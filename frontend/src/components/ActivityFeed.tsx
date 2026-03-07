import { useState, useEffect } from 'react';
import { API_BASE } from '../config/api';

interface ActivityItem {
  message: string;
  flag: string;
  timestamp: number;
}

interface ActivityData {
  total_visitors: number;
  activity: ActivityItem[];
}

function timeAgo(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000 - ts);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/demo/activity`);
        if (res.ok) {
          const data: ActivityData = await res.json();
          setItems(data.activity);
        }
      } catch { /* offline */ }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card overflow-hidden">
      <div className="panel-header">
        <span className="panel-tag">feed</span>
        <h4 className="panel-title">Activity</h4>
      </div>

      <div className="max-h-48 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-xs text-txt-3 text-center">
            No activity yet...
          </div>
        ) : (
          <div className="divide-y divide-line-subtle">
            {items.slice(0, 15).map((item, i) => (
              <div
                key={`${item.timestamp}-${i}`}
                className="flex items-start gap-2 px-3.5 py-2 text-[11px]"
              >
                <span className="text-sm flex-shrink-0 mt-px">{item.flag}</span>
                <span className="text-txt-2 flex-1">{item.message}</span>
                <span className="text-2xs text-txt-3 flex-shrink-0 whitespace-nowrap">
                  {timeAgo(item.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
