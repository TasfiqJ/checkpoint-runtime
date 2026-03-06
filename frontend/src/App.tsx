import { Routes, Route, Link, useLocation } from 'react-router-dom';
import RunsPage from './pages/RunsPage';
import RunDetailPage from './pages/RunDetailPage';
import CheckpointBrowser from './pages/CheckpointBrowser';
import HealthPage from './pages/HealthPage';
import PerformancePage from './pages/PerformancePage';
import DemoPage from './pages/DemoPage';

const navItems = [
  { to: '/demo', label: 'Live Demo' },
  { to: '/', label: 'Runs' },
  { to: '/checkpoints', label: 'Checkpoints' },
  { to: '/health', label: 'Health' },
  { to: '/performance', label: 'Performance' },
];

function App() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || (location.pathname.startsWith('/runs') && !location.pathname.startsWith('/demo'));
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Navigation */}
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <h1 className="text-lg font-semibold text-gray-100 tracking-tight">
              Checkpoint Runtime
            </h1>
          </Link>
          <div className="flex gap-1 text-sm font-medium">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  isActive(item.to)
                    ? 'bg-gray-800 text-indigo-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <Routes>
          <Route path="/" element={<RunsPage />} />
          <Route path="/demo" element={<DemoPage />} />
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
