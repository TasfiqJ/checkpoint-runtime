import { useState, useEffect, useRef } from 'react';
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
import TryLocallyPage from './pages/TryLocallyPage';
import ThemeToggle from './components/ThemeToggle';

const desktopNavItems = [
  { to: '/how-it-works', label: 'How It Works', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { to: '/demo', label: 'Live Demo', highlight: true, icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z' },
  { to: '/try-locally', label: 'Try Locally', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
];

const mobileNavItems = [
  { to: '/', label: 'Home' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/demo', label: 'Live Demo' },
  { to: '/try-locally', label: 'Try Locally' },
];

/* ─── SVG curved edge for the slide-in menu ─── */
function MenuCurve() {
  const [h, setH] = useState(window.innerHeight);
  useEffect(() => {
    const onResize = () => setH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const initial = `M100 0 L200 0 L200 ${h} L100 ${h} Q-100 ${h / 2} 100 0`;
  const target = `M100 0 L200 0 L200 ${h} L100 ${h} Q100 ${h / 2} 100 0`;

  return (
    <svg
      className="absolute top-0 -left-[99px] w-[100px] h-full"
      style={{ fill: 'rgb(var(--surface-1))', stroke: 'none' }}
    >
      <motion.path
        variants={{
          initial: { d: initial },
          enter: { d: target, transition: { duration: 1, ease: [0.76, 0, 0.24, 1] } },
          exit: { d: initial, transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] } },
        }}
        initial="initial"
        animate="enter"
        exit="exit"
      />
    </svg>
  );
}

function App() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollPositions = useRef<Record<string, number>>({});
  const prevPath = useRef(location.pathname);

  // Save scroll position before leaving, restore when arriving
  useEffect(() => {
    // Save scroll position of the page we're leaving
    scrollPositions.current[prevPath.current] = window.scrollY;
    prevPath.current = location.pathname;

    setMenuOpen(false);

    // Restore saved position or scroll to top for new pages
    const saved = scrollPositions.current[location.pathname];
    window.scrollTo(0, saved ?? 0);
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
        {/* Hamburger button — round glass pill */}
        <motion.button
          initial={false}
          animate={menuOpen ? 'open' : 'closed'}
          onClick={() => setMenuOpen((v) => !v)}
          className="fixed right-4 top-4 z-50 h-14 w-14 rounded-full glass-strong shadow-glow-sm"
        >
          <motion.span
            variants={HAMBURGER_VARIANTS.top}
            className="absolute block h-0.5 w-5 rounded-full bg-txt-1"
            style={{ y: '-50%', left: '50%', x: '-50%' }}
          />
          <motion.span
            variants={HAMBURGER_VARIANTS.middle}
            className="absolute block h-0.5 w-5 rounded-full bg-txt-1"
            style={{ left: '50%', x: '-50%', top: '50%', y: '-50%' }}
          />
          <motion.span
            variants={HAMBURGER_VARIANTS.bottom}
            className="absolute block h-0.5 w-2.5 rounded-full bg-txt-1"
            style={{ x: '-50%', y: '50%' }}
          />
        </motion.button>

        {/* Backdrop + sliding panel */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-30 bg-black/40"
            />
          )}
          {menuOpen && (
            <motion.nav
              key="panel"
              variants={MENU_SLIDE}
              initial="initial"
              animate="enter"
              exit="exit"
              className="fixed right-0 top-0 z-40 w-[80vw] max-w-[380px] bg-surface-1"
              style={{ height: '100dvh' }}
            >
              <div className="h-full flex flex-col justify-between px-10 pt-28 pb-10">
                {/* Navigation header */}
                <div>
                  <p className="uppercase text-[11px] tracking-[0.15em] text-txt-3 mb-10 pb-3 border-b border-line">
                    Navigation
                  </p>
                  <div className="flex flex-col gap-4">
                    {mobileNavItems.map((item, i) => (
                      <motion.div
                        key={item.to}
                        custom={i}
                        variants={LINK_SLIDE}
                        initial="initial"
                        animate="enter"
                        exit="exit"
                        className="relative flex items-center"
                      >
                        <motion.div
                          variants={INDICATOR_SCALE}
                          animate={isActive(item.to) ? 'open' : 'closed'}
                          className="absolute -left-5 w-2.5 h-2.5 rounded-full bg-brand-violet"
                        />
                        <Link
                          to={item.to}
                          onClick={() => setMenuOpen(false)}
                          className={`text-[2.75rem] leading-tight font-serif font-light transition-colors ${
                            isActive(item.to) ? 'text-txt-1' : 'text-txt-3 hover:text-txt-1'
                          }`}
                        >
                          {item.label}
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <ThemeToggle />
                  <span className="text-xs text-txt-3 font-mono">Checkpoint Runtime</span>
                </div>
              </div>
              <MenuCurve />
            </motion.nav>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Content ─── */}
      <main className={`flex-1 ${isLanding ? '' : 'pt-20 max-w-[1400px] mx-auto w-full px-4 sm:px-5 py-6'}`}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/try-locally" element={<TryLocallyPage />} />
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

const EASE_CURVE: [number, number, number, number] = [0.76, 0, 0.24, 1];

const MENU_SLIDE = {
  initial: { x: 'calc(100% + 100px)' },
  enter: { x: '0%', transition: { duration: 0.8, ease: EASE_CURVE } },
  exit: { x: 'calc(100% + 100px)', transition: { duration: 0.8, ease: EASE_CURVE } },
};

const LINK_SLIDE = {
  initial: { x: 80 },
  enter: (i: number) => ({
    x: 0,
    transition: { duration: 0.8, ease: EASE_CURVE, delay: 0.05 * i },
  }),
  exit: (i: number) => ({
    x: 80,
    transition: { duration: 0.8, ease: EASE_CURVE, delay: 0.05 * i },
  }),
};

const INDICATOR_SCALE = {
  open: { scale: 1, transition: { duration: 0.3 } },
  closed: { scale: 0, transition: { duration: 0.4 } },
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
