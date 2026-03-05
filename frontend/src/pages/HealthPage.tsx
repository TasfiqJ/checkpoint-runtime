function HealthPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">System Health</h2>
        <p className="mt-1 text-sm text-gray-500">
          Monitor the health status of all checkpoint runtime components.
        </p>
      </div>

      {/* Overall status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full bg-green-500"></div>
          <h3 className="text-lg font-semibold text-gray-900">All Systems Operational</h3>
        </div>
        <p className="mt-2 text-sm text-gray-500">Last checked: 30 seconds ago</p>
      </div>

      {/* Component health cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">Control Plane (Python)</h4>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
              Healthy
            </span>
          </div>
          <p className="text-xs text-gray-500">gRPC server on port 50051</p>
          <div className="mt-2 text-xs text-gray-400">Uptime: 48h 23m</div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">Data Plane (Rust)</h4>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
              Healthy
            </span>
          </div>
          <p className="text-xs text-gray-500">High-performance data transfer layer</p>
          <div className="mt-2 text-xs text-gray-400">Uptime: 48h 23m</div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">Storage Backend</h4>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
              Healthy
            </span>
          </div>
          <p className="text-xs text-gray-500">S3-compatible object storage</p>
          <div className="mt-2 text-xs text-gray-400">Latency: 12ms avg</div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">Observability Stack</h4>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
              Degraded
            </span>
          </div>
          <p className="text-xs text-gray-500">Prometheus + Grafana metrics pipeline</p>
          <div className="mt-2 text-xs text-gray-400">Some metrics delayed by ~5s</div>
        </div>
      </div>

      {/* Recent events */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Events</h3>
        </div>
        <div className="divide-y divide-gray-200">
          <div className="px-6 py-3 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-sm text-gray-700">Checkpoint save completed for run-001 step 24000</span>
            <span className="ml-auto text-xs text-gray-400">5 min ago</span>
          </div>
          <div className="px-6 py-3 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
            <span className="text-sm text-gray-700">Observability metrics pipeline experiencing slight delay</span>
            <span className="ml-auto text-xs text-gray-400">12 min ago</span>
          </div>
          <div className="px-6 py-3 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-sm text-gray-700">Data plane reconnected after brief network interruption</span>
            <span className="ml-auto text-xs text-gray-400">1 hr ago</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HealthPage;
