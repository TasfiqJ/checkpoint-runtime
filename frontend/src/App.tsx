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
  { to: '/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/how-it-works', label: 'How It Works', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { to: '/demo', label: 'Live Demo', highlight: true, icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z' },
  { to: '/runs', label: 'Runs', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  { to: '/checkpoints', label: 'Saves', icon: 'M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4' },
  { to: '/health', label: 'Health', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
  { to: '/performance', label: 'Metrics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
];

function App() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/runs')
      return location.pathname === '/runs' || location.pathname.startsWith('/runs/');
    return location.pathname.startsWith(path);
  };

  const isLanding = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col bg-surface-0">
      {/* Floating glassmorphic navbar */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 glass-strong px-2 py-1.5 flex items-center gap-1 shadow-glow-sm">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 px-3 py-1.5 group mr-1">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-blue to-brand-violet flex items-center justify-center shadow-glow-sm">
            <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2 3h8M2 6h5M2 9h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-sm font-bold text-txt-1 tracking-tight group-hover:text-brand-violet transition-colors hidden lg:inline">
            Checkpoint
          </span>
        </Link>

        {/* Divider */}
        <div className="w-px h-5 bg-line-emphasis mr-1" />

        {/* Nav links */}
        {navItems.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl transition-all duration-200 cursor-pointer ${
                active
                  ? 'text-txt-1 bg-surface-4/80'
                  : item.highlight
                    ? 'text-brand-pink hover:text-brand-violet hover:bg-surface-3/60'
                    : 'text-txt-3 hover:text-txt-1 hover:bg-surface-3/60'
              }`}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span className="hidden md:inline">{item.label}</span>
              {item.highlight && !active && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-pink animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Content — padded for floating nav */}
      <main className={`flex-1 pt-20 ${isLanding ? '' : 'max-w-[1400px] mx-auto w-full px-5 py-6'}`}>
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
