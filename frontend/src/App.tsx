import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import LandingPage from './pages/LandingPage';
import RunsPage from './pages/RunsPage';
import RunDetailPage from './pages/RunDetailPage';
import CheckpointBrowser from './pages/CheckpointBrowser';
import HealthPage from './pages/HealthPage';
import PerformancePage from './pages/PerformancePage';
import DemoPage from './pages/DemoPage';
import HowItWorksPage from './pages/HowItWorksPage';
import ThemeToggle from './components/ThemeToggle';

const desktopNavItems = [
  { to: '/how-it-works', label: 'How It Works', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { to: '/demo', label: 'Live Demo', highlight: true, icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z' },
];

const mobileNavItems = [
  { to: '/', label: 'Home' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/demo', label: 'Live Demo' },
];

function App() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close mobile menu + scroll to top on navigation
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Lock body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/runs')
      return location.pathname === '/runs' || location.pathname.startsWith('/runs/');
    return location.pathname.startsWith(path);
  };

  const isLanding = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col bg-surface-0">

      {/* ─── Desktop navbar (hidden on mobile) ─── */}
      <nav className="hidden md:flex fixed top-4 left-1/2 -translate-x-1/2 z-50 glass-strong px-2 py-1.5 items-center gap-1 shadow-glow-sm">
        <Link to="/" className="flex items-center px-3 py-2 text-xs font-medium rounded-xl transition-all duration-200 text-txt-3 hover:text-txt-1 hover:bg-surface-3/60">
          <svg className="w-3.5 h-3.5 flex-shrink-0 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span>Home</span>
        </Link>

        {desktopNavItems.map((item) => {
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
              <span>{item.label}</span>
              {item.highlight && !active && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-pink animate-pulse" />
              )}
            </Link>
          );
        })}

        <ThemeToggle />
      </nav>

      {/* ─── Mobile nav (visible only on mobile) ─── */}
      <div className="md:hidden">
        {/* Expanding underlay */}
        <motion.div
          initial={false}
          animate={menuOpen ? 'open' : 'closed'}
          variants={UNDERLAY_VARIANTS}
          style={{ top: 16, right: 16 }}
          className="fixed z-40 rounded-xl bg-surface-1/20 backdrop-blur-md border border-line/20 shadow-glow"
        />

        {/* Hamburger button */}
        <motion.button
          initial={false}
          animate={menuOpen ? 'open' : 'closed'}
          onClick={() => setMenuOpen((v) => !v)}
          className={`group fixed right-4 top-4 z-50 h-16 w-16 transition-all ${
            menuOpen ? 'rounded-bl-xl rounded-tr-xl' : 'rounded-xl'
          }`}
        >
          <motion.span
            variants={HAMBURGER_VARIANTS.top}
            className="absolute block h-0.5 w-6 rounded-full bg-txt-1"
            style={{ y: '-50%', left: '50%', x: '-50%' }}
          />
          <motion.span
            variants={HAMBURGER_VARIANTS.middle}
            className="absolute block h-0.5 w-6 rounded-full bg-txt-1"
            style={{ left: '50%', x: '-50%', top: '50%', y: '-50%' }}
          />
          <motion.span
            variants={HAMBURGER_VARIANTS.bottom}
            className="absolute block h-0.5 w-3 rounded-full bg-txt-1"
            style={{ x: '-50%', y: '50%' }}
          />
        </motion.button>

        {/* Overlay content */}
        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.3, duration: 0.3 } }}
              exit={{ opacity: 0, transition: { delay: 0.1, duration: 0.2 } }}
              className="fixed right-4 top-4 z-40 h-[calc(100vh_-_32px)] w-[calc(100%_-_32px)] overflow-hidden flex flex-col"
            >
              {/* Links */}
              <div className="flex-1 flex flex-col justify-center space-y-4 p-10">
                {mobileNavItems.map((item, idx) => (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: {
                        delay: 0.75 + idx * 0.125,
                        duration: 0.5,
                        ease: 'easeInOut',
                      },
                    }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    <Link
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className={`block text-4xl font-serif transition-colors ${
                        isActive(item.to)
                          ? 'text-brand-violet'
                          : 'text-txt-2 hover:text-txt-1'
                      }`}
                    >
                      {item.label}.
                    </Link>
                  </motion.div>
                ))}
              </div>

              {/* Footer */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { delay: 1.125, duration: 0.5, ease: 'easeInOut' },
                }}
                exit={{ opacity: 0, y: 8 }}
                className="px-10 pb-8 flex items-center justify-between"
              >
                <ThemeToggle />
                <span className="text-xs text-txt-3 font-mono">Checkpoint Runtime</span>
              </motion.div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Content ─── */}
      <main className={`flex-1 ${isLanding ? '' : 'pt-10 md:pt-20 max-w-[1400px] mx-auto w-full px-5 py-6'}`}>
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

/* ─── Animation variants ─── */

const UNDERLAY_VARIANTS = {
  open: {
    width: 'calc(100% - 32px)',
    height: 'calc(100vh - 32px)',
    transition: { type: 'spring' as const, mass: 3, stiffness: 400, damping: 50 },
  },
  closed: {
    width: '80px',
    height: '80px',
    transition: {
      delay: 0.75,
      type: 'spring' as const,
      mass: 3,
      stiffness: 400,
      damping: 50,
    },
  },
};

const HAMBURGER_VARIANTS = {
  top: {
    open: {
      rotate: ['0deg', '0deg', '45deg'],
      top: ['35%', '50%', '50%'],
    },
    closed: {
      rotate: ['45deg', '0deg', '0deg'],
      top: ['50%', '50%', '35%'],
    },
  },
  middle: {
    open: {
      rotate: ['0deg', '0deg', '-45deg'],
    },
    closed: {
      rotate: ['-45deg', '0deg', '0deg'],
    },
  },
  bottom: {
    open: {
      rotate: ['0deg', '0deg', '45deg'],
      bottom: ['35%', '50%', '50%'],
      left: '50%',
    },
    closed: {
      rotate: ['45deg', '0deg', '0deg'],
      bottom: ['50%', '50%', '35%'],
      left: 'calc(50% + 10px)',
    },
  },
};
