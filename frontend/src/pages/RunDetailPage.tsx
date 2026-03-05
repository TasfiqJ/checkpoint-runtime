import { useParams, Link } from 'react-router-dom';

function RunDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-gray-500">
        <Link to="/" className="hover:text-indigo-600">Runs</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">{id}</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Run: {id}</h2>
          <p className="mt-1 text-sm text-gray-500">
            Detailed view of training run with checkpoint history and metrics.
          </p>
        </div>
        <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">
          Running
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Checkpoints</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">12</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Current Step</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">24,000</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Avg Checkpoint Time</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">3.2s</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Size</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">14.8 GB</p>
        </div>
      </div>

      {/* Metrics chart placeholder */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Training Loss</h3>
        <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-400 text-sm">Loss chart will be rendered here with Recharts</p>
        </div>
      </div>

      {/* Checkpoint history table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Checkpoint History</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Step</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 text-sm font-medium text-gray-900">24,000</td>
              <td className="px-6 py-4 text-sm text-gray-500">5 min ago</td>
              <td className="px-6 py-4 text-sm text-gray-700">1.2 GB</td>
              <td className="px-6 py-4 text-sm text-gray-700">3.1s</td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Saved</span>
              </td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 text-sm font-medium text-gray-900">22,000</td>
              <td className="px-6 py-4 text-sm text-gray-500">35 min ago</td>
              <td className="px-6 py-4 text-sm text-gray-700">1.2 GB</td>
              <td className="px-6 py-4 text-sm text-gray-700">3.4s</td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Saved</span>
              </td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 text-sm font-medium text-gray-900">20,000</td>
              <td className="px-6 py-4 text-sm text-gray-500">1 hr ago</td>
              <td className="px-6 py-4 text-sm text-gray-700">1.2 GB</td>
              <td className="px-6 py-4 text-sm text-gray-700">2.9s</td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Saved</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RunDetailPage;
