import { Routes, Route, Link, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import RunsPage from './pages/RunsPage';
import RunDetailPage from './pages/RunDetailPage';
import CheckpointBrowser from './pages/CheckpointBrowser';
import HealthPage from './pages/HealthPage';
import PerformancePage from './pages/PerformancePage';
import DemoPage from './pages/DemoPage';
import HowItWorksPage from './pages/HowItWorksPage';

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/demo', label: 'Live Demo', highlight: true },
  { to: '/runs', label: 'Runs' },
  { to: '/checkpoints', label: 'Checkpoints' },
  { to: '/health', label: 'Health' },
  { to: '/performance', label: 'Performance' },
];

function App() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/runs')
      return location.pathname === '/runs' || location.pathname.startsWith('/runs/');
    return location.pathname.startsWith(path);
  };

  // Landing page gets full-width treatment
  const isLanding = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col bg-surface-0">
      {/* ── Navigation ──────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-surface-0/80 backdrop-blur-xl border-b border-border-subtle">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-5 h-12">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-5 h-5 rounded-md bg-accent flex items-center justify-center">
              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                <path d="M2 3h8M2 6h5M2 9h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-text-primary tracking-tight group-hover:text-accent-hover transition-colors">
              Checkpoint Runtime
            </span>
          </Link>

          <div className="flex items-center gap-0.5">
            {navItems.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`relative px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 ${
                    active
                      ? 'text-text-primary bg-surface-2'
                      : item.highlight
                        ? 'text-accent-hover hover:text-accent hover:bg-accent-subtle'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute bottom-0 left-2.5 right-2.5 h-px bg-accent" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ── Content ─────────────────────────────────────────────── */}
      <main className={`flex-1 ${isLanding ? '' : 'max-w-[1400px] mx-auto w-full px-5 py-6'}`}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/runs" element={<RunsPage />} />
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
