function CheckpointBrowser() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Checkpoint Browser</h2>
        <p className="mt-1 text-sm text-gray-500">
          Browse, compare, and manage stored checkpoints across all training runs.
        </p>
      </div>

      {/* Search and filter bar */}
      <div className="mb-6 flex gap-4 items-center">
        <div className="flex-1 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-400">
          Search checkpoints by run ID, step, or tag...
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-400">
          Sort by: Newest
        </div>
      </div>

      {/* Storage summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Checkpoints</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">65</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Storage Used</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">78.4 GB</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Storage Backend</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">S3 + Local</p>
        </div>
      </div>

      {/* Checkpoint grid placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {['run-001 / step-24000', 'run-001 / step-22000', 'run-002 / step-48000', 'run-002 / step-46000', 'run-003 / step-5000', 'run-003 / step-4000'].map(
          (checkpoint) => (
            <div
              key={checkpoint}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer"
            >
              <h4 className="text-sm font-semibold text-gray-900">{checkpoint}</h4>
              <p className="text-xs text-gray-500 mt-1">Size: 1.2 GB</p>
              <p className="text-xs text-gray-500">Saved: 5 min ago</p>
              <div className="mt-3 flex gap-2">
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-indigo-50 text-indigo-700">
                  latest
                </span>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export default CheckpointBrowser;
