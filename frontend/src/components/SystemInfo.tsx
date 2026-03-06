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
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">uname</span>
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Host System
          </h4>
        </div>
        <p className="text-[10px] text-gray-600 text-center py-2">Loading system info...</p>
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
        <span className="text-[10px] font-mono bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">uname</span>
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Host System
        </h4>
      </div>
      <div className="p-2 space-y-0.5 font-mono text-[11px]">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-2">
            <span className="text-gray-500 w-[72px] flex-shrink-0 text-right">
              {row.label}
            </span>
            <span className="text-gray-300">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
