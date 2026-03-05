import { Link } from 'react-router-dom';

function RunsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Training Runs</h2>
        <p className="mt-1 text-sm text-gray-500">
          View and manage all training runs with checkpoint tracking.
        </p>
      </div>

      {/* Filters placeholder */}
      <div className="mb-4 flex gap-4 items-center">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-400">
          Filter by status...
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-400">
          Filter by model...
        </div>
      </div>

      {/* Table placeholder */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Run ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Model
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Checkpoints
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Started
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Placeholder rows */}
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <Link to="/runs/run-001" className="text-indigo-600 hover:text-indigo-800 font-medium">
                  run-001
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">gpt-mini-v1</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                  Running
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">12</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">2 hours ago</td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <Link to="/runs/run-002" className="text-indigo-600 hover:text-indigo-800 font-medium">
                  run-002
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">gpt-mini-v2</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                  Completed
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">48</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">1 day ago</td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <Link to="/runs/run-003" className="text-indigo-600 hover:text-indigo-800 font-medium">
                  run-003
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">transformer-large</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                  Paused
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">5</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">3 days ago</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RunsPage;
