import { usePolling } from '../hooks/usePolling';
import { API_BASE } from '../config/api';

interface SystemData {
  hostname: string;
  os: string;
  arch: string;
  cpu: string;
  cpu_count: number;
  memory_total: string;
  memory_available: string;
  disk: string;
  uptime: string;
  docker_version: string;
  container_count: number;
  python_version: string;
}

export default function SystemInfo() {
  const { data } = usePolling<SystemData>(`${API_BASE}/api/demo/system`, 30000);

  if (!data) {
    return (
      <div className="card p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="panel-tag">uname</span>
          <h4 className="panel-title">Host System</h4>
        </div>
        <p className="text-2xs text-text-tertiary text-center py-2">Loading system info...</p>
      </div>
    );
  }

  const rows = [
    { label: 'Hostname', value: data.hostname },
    { label: 'OS', value: data.os },
    { label: 'CPU', value: `${data.cpu} (${data.cpu_count} cores)` },
    { label: 'Memory', value: `${data.memory_total} total` },
    { label: 'Disk', value: data.disk },
    { label: 'Uptime', value: data.uptime },
    { label: 'Docker', value: data.docker_version },
    { label: 'Containers', value: `${data.container_count} running` },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="panel-header">
        <span className="panel-tag">uname</span>
        <h4 className="panel-title">Host System</h4>
      </div>
      <div className="p-2.5 space-y-0.5 font-mono text-[11px]">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-2">
            <span className="text-text-tertiary w-[72px] flex-shrink-0 text-right">
              {row.label}
            </span>
            <span className="text-text-secondary">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
