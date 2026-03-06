import { usePolling } from '../hooks/usePolling';

interface ContainerInfo {
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
}

export default function ContainerStatus() {
  const { data: containers } = usePolling<ContainerInfo[]>(
    '/api/demo/containers',
    3000,
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
        <span className="text-[10px] font-mono bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">docker ps</span>
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Infrastructure
        </h4>
      </div>

      <div className="divide-y divide-gray-800/50 max-h-64 overflow-y-auto">
        {containers && containers.length > 0 ? (
          containers.map((c) => {
            const isRunning = c.state === 'running';
            return (
              <div key={c.name} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isRunning ? 'bg-green-400' : 'bg-red-500'
                  }`}
                />
                <span className="font-mono text-gray-300 truncate flex-1">
                  {c.name}
                </span>
                <span className={`text-[10px] ${isRunning ? 'text-gray-500' : 'text-red-400'}`}>
                  {c.status}
                </span>
              </div>
            );
          })
        ) : (
          <div className="px-3 py-4 text-xs text-gray-600 text-center">
            Waiting for container data...
          </div>
        )}
      </div>
    </div>
  );
}
