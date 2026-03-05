import { Routes, Route, Link } from 'react-router-dom';
import RunsPage from './pages/RunsPage';
import RunDetailPage from './pages/RunDetailPage';
import CheckpointBrowser from './pages/CheckpointBrowser';
import HealthPage from './pages/HealthPage';
import PerformancePage from './pages/PerformancePage';

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">
            Checkpoint Runtime
          </h1>
          <div className="flex gap-6 text-sm font-medium">
            <Link to="/" className="text-gray-600 hover:text-indigo-600 transition-colors">
              Runs
            </Link>
            <Link to="/checkpoints" className="text-gray-600 hover:text-indigo-600 transition-colors">
              Checkpoints
            </Link>
            <Link to="/health" className="text-gray-600 hover:text-indigo-600 transition-colors">
              Health
            </Link>
            <Link to="/performance" className="text-gray-600 hover:text-indigo-600 transition-colors">
              Performance
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <Routes>
          <Route path="/" element={<RunsPage />} />
          <Route path="/runs/:id" element={<RunDetailPage />} />
          <Route path="/checkpoints" element={<CheckpointBrowser />} />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/performance" element={<PerformancePage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
