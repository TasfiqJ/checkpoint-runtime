import { usePolling } from '../hooks/usePolling';
import { API_BASE } from '../config/api';

interface ContainerInfo {
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
}

export default function ContainerStatus() {
  const { data: containers } = usePolling<ContainerInfo[]>(
    `${API_BASE}/api/demo/containers`,
    3000,
  );

  return (
    <div className="card overflow-hidden">
      <div className="panel-header">
        <span className="panel-tag">docker ps</span>
        <h4 className="panel-title">Infrastructure</h4>
      </div>

      <div className="px-3.5 py-2 border-b border-line-subtle">
        <p className="text-2xs text-txt-3 leading-relaxed">
          Live Docker containers on the server. When you kill a worker, watch its status change from{' '}
          <span className="text-ok">running</span> to <span className="text-err">exited</span> and back.
        </p>
      </div>

      <div className="divide-y divide-line-subtle max-h-64 overflow-y-auto">
        {containers && containers.length > 0 ? (
          containers.map((c) => {
            const isRunning = c.state === 'running';
            return (
              <div key={c.name} className="flex items-center gap-2 px-3.5 py-1.5 text-xs">
                <div
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    isRunning ? 'bg-ok' : 'bg-err'
                  }`}
                />
                <span className="font-mono text-txt-2 truncate flex-1">
                  {c.name}
                </span>
                <span className={`text-2xs ${isRunning ? 'text-txt-3' : 'text-err'}`}>
                  {c.status}
                </span>
              </div>
            );
          })
        ) : (
          <div className="px-3 py-4 text-xs text-txt-3 text-center">
            Waiting for container data...
          </div>
        )}
      </div>
    </div>
  );
}
