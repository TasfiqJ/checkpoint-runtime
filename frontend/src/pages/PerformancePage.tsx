function PerformancePage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Performance Metrics</h2>
        <p className="mt-1 text-sm text-gray-500">
          Monitor checkpoint save/restore throughput, latency, and resource utilization.
        </p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Avg Save Latency</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">3.2s</p>
          <p className="text-xs text-green-600 mt-1">-12% from last hour</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Avg Restore Latency</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">1.8s</p>
          <p className="text-xs text-green-600 mt-1">-5% from last hour</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Throughput</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">4.6 GB/s</p>
          <p className="text-xs text-gray-500 mt-1">Peak: 5.2 GB/s</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">GPU Memory Used</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">72%</p>
          <p className="text-xs text-yellow-600 mt-1">Above 70% threshold</p>
        </div>
      </div>

      {/* Latency chart placeholder */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Save Latency Over Time</h3>
        <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-400 text-sm">Latency time-series chart will be rendered here with Recharts</p>
        </div>
      </div>

      {/* Throughput chart placeholder */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Throughput Over Time</h3>
        <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-400 text-sm">Throughput bar chart will be rendered here with Recharts</p>
        </div>
      </div>

      {/* Resource utilization */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Resource Utilization</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-700">CPU Usage</span>
              <span className="text-gray-500">45%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full">
              <div className="h-2 bg-indigo-500 rounded-full" style={{ width: '45%' }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-700">Memory Usage</span>
              <span className="text-gray-500">68%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full">
              <div className="h-2 bg-indigo-500 rounded-full" style={{ width: '68%' }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-700">GPU Memory</span>
              <span className="text-gray-500">72%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full">
              <div className="h-2 bg-yellow-500 rounded-full" style={{ width: '72%' }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-700">Network I/O</span>
              <span className="text-gray-500">32%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full">
              <div className="h-2 bg-indigo-500 rounded-full" style={{ width: '32%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PerformancePage;
