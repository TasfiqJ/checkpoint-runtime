import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';

type SimulationPhase = 'idle' | 'running' | 'failed' | 'recovering' | 'recovered';
type EventType = 'info' | 'success' | 'warning' | 'error';

interface TimelineEvent {
  id: number;
  time: number;
  label: string;
  type: EventType;
}

interface SimulatedCheckpoint {
  step: number;
  size: string;
  hash: string;
}

const EVENT_COLORS: Record<EventType, string> = {
  info: 'border-l-info bg-info-muted text-info',
  success: 'border-l-ok bg-ok-muted text-ok',
  warning: 'border-l-warn bg-warn-muted text-warn',
  error: 'border-l-err bg-err-muted text-err',
};

const PIPELINE = [
  { label: 'RUNNING', detail: 'training' },
  { label: 'FAILED', detail: 'timeout' },
  { label: 'RECOVERING', detail: 'load save' },
  { label: 'RESUMED', detail: 'continue' },
] as const;

function pipelineIndex(phase: SimulationPhase) {
  if (phase === 'failed') return 1;
  if (phase === 'recovering') return 2;
  if (phase === 'recovered') return 3;
  return 0;
}

function SimulationPipeline({ phase }: { phase: SimulationPhase }) {
  const activeIndex = pipelineIndex(phase);

  return (
    <div className="card px-4 py-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-2xs font-semibold text-txt-3 uppercase tracking-widest">Simulated state machine</p>
          <p className="text-xs text-txt-3 mt-1">These transitions happen in this browser tab only.</p>
        </div>
        <span className="badge-xs bg-brand-violet/10 text-brand-violet">simulation</span>
      </div>

      <div className="flex items-start justify-between gap-1">
        {PIPELINE.map((item, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          const color = index === 1 ? 'bg-err text-err' : index === 2 ? 'bg-recover text-recover' : 'bg-ok text-ok';

          return (
            <div key={item.label} className="flex items-start gap-1 flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5 min-w-[54px] sm:min-w-[72px]">
                <motion.div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive
                      ? `${color.split(' ')[0]} text-surface-0 ring-4 ring-current/20`
                      : isPast
                        ? `${color.split(' ')[0]}/25 ${color.split(' ')[1]}`
                        : 'bg-surface-3 text-txt-3'
                  }`}
                  animate={isActive ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                  transition={isActive ? { duration: 1.4, repeat: Infinity } : { duration: 0.2 }}
                >
                  {isPast ? '✓' : <span className="w-2 h-2 rounded-full bg-current" />}
                </motion.div>
                <span className={`text-[10px] sm:text-2xs font-semibold ${isActive ? color.split(' ')[1] : 'text-txt-3'}`}>
                  {item.label}
                </span>
                <span className="hidden sm:block text-[9px] text-txt-3">{item.detail}</span>
              </div>

              {index < PIPELINE.length - 1 && (
                <div className={`h-0.5 flex-1 rounded mt-3.5 ${index < activeIndex ? 'bg-ok' : 'bg-surface-3'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StageCard({
  number,
  title,
  description,
  status,
  tone,
}: {
  number: number;
  title: string;
  description: string;
  status: 'waiting' | 'active' | 'complete';
  tone: 'ok' | 'err' | 'recover';
}) {
  const toneClasses = {
    ok: 'bg-ok-muted text-ok border-ok/30',
    err: 'bg-err-muted text-err border-err/30',
    recover: 'bg-recover-muted text-recover border-recover/30',
  }[tone];

  return (
    <motion.div layout className={`card p-5 border transition-all ${status === 'active' ? toneClasses : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${toneClasses}`}>
          {status === 'complete' ? '✓' : number}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-txt-1">{title}</h3>
            <span className={`text-[10px] uppercase tracking-wider font-semibold ${status === 'active' ? toneClasses.split(' ')[1] : 'text-txt-3'}`}>
              {status}
            </span>
          </div>
          <p className="text-sm text-txt-3 leading-relaxed mt-1.5">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function DemoPage() {
  const [phase, setPhase] = useState<SimulationPhase>('idle');
  const [step, setStep] = useState(0);
  const [checkpoints, setCheckpoints] = useState<SimulatedCheckpoint[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [killedWorker, setKilledWorker] = useState<string | null>(null);
  const [killStep, setKillStep] = useState<number | null>(null);
  const [restoredStep, setRestoredStep] = useState<number | null>(null);
  const [recoverySeconds, setRecoverySeconds] = useState(0);

  const startTimeRef = useRef(0);
  const lastCheckpointRef = useRef(0);
  const lastLogStepRef = useRef(0);
  const nextEventIdRef = useRef(0);
  const recoveryTimersRef = useRef<number[]>([]);

  const clearRecoveryTimers = useCallback(() => {
    recoveryTimersRef.current.forEach(timer => window.clearTimeout(timer));
    recoveryTimersRef.current = [];
  }, []);

  useEffect(() => clearRecoveryTimers, [clearRecoveryTimers]);

  const addEvent = useCallback((label: string, type: EventType = 'info') => {
    setTimeline(previous => [
      ...previous,
      {
        id: nextEventIdRef.current++,
        time: Math.max(0, Date.now() - startTimeRef.current),
        label,
        type,
      },
    ].slice(-18));
  }, []);

  const addLog = useCallback((line: string) => {
    setLogs(previous => [...previous, line].slice(-14));
  }, []);

  const isTraining = phase === 'running' || phase === 'recovered';

  useEffect(() => {
    if (!isTraining) return;

    const timer = window.setInterval(() => {
      setStep(previous => previous + 5);
    }, 250);

    return () => window.clearInterval(timer);
  }, [isTraining]);

  useEffect(() => {
    if (!isTraining || step === 0) return;

    const logStep = Math.floor(step / 25) * 25;
    if (logStep > lastLogStepRef.current) {
      lastLogStepRef.current = logStep;
      addLog(`[trainer] step=${logStep} loss=${(2.3 * Math.exp(-logStep / 650) + 0.08).toFixed(3)} workers=2`);
    }

    const checkpointStep = Math.floor(step / 50) * 50;
    if (checkpointStep >= 50 && checkpointStep > lastCheckpointRef.current) {
      lastCheckpointRef.current = checkpointStep;
      const checkpoint = {
        step: checkpointStep,
        size: `${(3.7 + (checkpointStep % 3) * 0.1).toFixed(1)} MiB`,
        hash: `sim-${checkpointStep.toString(16).padStart(4, '0')}-7f3a9c2e`,
      };
      setCheckpoints(previous => [...previous, checkpoint]);
      addEvent(`Simulated checkpoint committed at step ${checkpointStep}`, 'success');
      addLog(`[checkpoint] committed step=${checkpointStep} sha256=${checkpoint.hash}`);
    }
  }, [addEvent, addLog, isTraining, step]);

  useEffect(() => {
    if (phase !== 'failed' && phase !== 'recovering') return;

    const timer = window.setInterval(() => {
      setRecoverySeconds(previous => Math.round((previous + 0.1) * 10) / 10);
    }, 100);

    return () => window.clearInterval(timer);
  }, [phase]);

  const startSimulation = () => {
    clearRecoveryTimers();
    startTimeRef.current = Date.now();
    lastCheckpointRef.current = 0;
    lastLogStepRef.current = 0;
    nextEventIdRef.current = 1;
    setPhase('running');
    setStep(0);
    setCheckpoints([]);
    setKilledWorker(null);
    setKillStep(null);
    setRestoredStep(null);
    setRecoverySeconds(0);
    setTimeline([{ id: 0, time: 0, label: 'Browser simulation started', type: 'success' }]);
    setLogs([
      '[simulator] browser-only mode initialized',
      '[simulator] no backend connection opened',
      '[trainer] two simulated workers started',
    ]);
  };

  const killSimulatedWorker = (workerName: string) => {
    if (phase !== 'running' || checkpoints.length === 0) return;

    clearRecoveryTimers();
    const latestCheckpointStep = checkpoints[checkpoints.length - 1].step;
    setKilledWorker(workerName);
    setKillStep(step);
    setRestoredStep(null);
    setRecoverySeconds(0);
    setPhase('failed');
    addEvent(`${workerName} stopped inside the simulation`, 'error');
    addLog(`[failure] ${workerName} heartbeat stopped (simulated)`);

    recoveryTimersRef.current.push(
      window.setTimeout(() => {
        setPhase('recovering');
        addEvent('Simulated heartbeat timeout detected; loading last checkpoint', 'warning');
        addLog(`[recovery] loading simulated checkpoint from step=${latestCheckpointStep}`);
      }, 900),
      window.setTimeout(() => {
        setStep(latestCheckpointStep);
        setRestoredStep(latestCheckpointStep);
        setPhase('recovered');
        setRecoverySeconds(3.2);
        addEvent(`Training resumed from simulated checkpoint at step ${latestCheckpointStep}`, 'success');
        addLog(`[recovery] complete; resumed at step=${latestCheckpointStep}`);
      }, 3200),
    );
  };

  const latestCheckpoint = checkpoints[checkpoints.length - 1] ?? null;
  const currentLoss = (2.3 * Math.exp(-step / 650) + 0.08).toFixed(3);
  const canKill = phase === 'running' && checkpoints.length > 0;
  const hasStarted = phase !== 'idle';
  const hasFailed = phase === 'failed' || phase === 'recovering' || phase === 'recovered';
  const hasRecovered = phase === 'recovered';

  const chartPoints = useMemo(() => {
    return Array.from({ length: 28 }, (_, index) => {
      const pointStep = Math.max(0, step - (27 - index) * 10);
      const value = 2.3 * Math.exp(-pointStep / 650) + 0.08;
      const x = (index / 27) * 100;
      const y = Math.max(4, Math.min(33, ((value - 0.08) / 2.3) * 29 + 3));
      return `${x},${36 - y}`;
    }).join(' ');
  }, [step]);

  const phaseLabel = {
    idle: 'READY',
    running: 'RUNNING',
    failed: 'FAILED',
    recovering: 'RECOVERING',
    recovered: 'RESUMED',
  }[phase];

  return (
    <MotionConfig reducedMotion="user">
    <div className="max-w-6xl mx-auto py-8 space-y-6">
      <section className="card p-5 sm:p-6 border-warn/30 bg-warn-muted/5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="badge-xs bg-warn-muted text-warn">browser simulation</span>
              <span className="badge-xs bg-surface-3 text-txt-3">no live backend</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-txt-1">
              I’m retiring my paid Hetzner backend server.
            </h1>
            <p className="text-sm sm:text-base text-txt-2 mt-2 leading-relaxed max-w-3xl">
              This page now runs an honest, self-contained simulation in your browser. It makes no API requests,
              starts no cloud resources, and cannot stop a real worker. To run the actual system, use the local setup.
            </p>
          </div>
          <Link
            to="/try-locally"
            className="btn-primary cursor-pointer inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold whitespace-nowrap"
          >
            Run the real system locally
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      <section className="text-center space-y-5 py-5">
        <div className="inline-flex items-center gap-2 bg-brand-violet/10 text-brand-violet text-xs font-semibold px-3 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-brand-violet animate-pulse motion-reduce:animate-none" />
          Interactive simulation · runs only in this tab
        </div>
        <h2 className="text-4xl sm:text-5xl font-extrabold text-txt-1 tracking-tight leading-tight">
          Break a simulated worker.
          <br />
          <span className="font-serif italic">Watch it recover from a save point.</span>
        </h2>
        <p className="text-txt-2 text-lg max-w-2xl mx-auto leading-relaxed">
          The sequence mirrors the checkpoint recovery flow, but every number, log, worker, and file shown here is generated locally in your browser.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={startSimulation} className="btn-primary px-8 py-3.5 text-base cursor-pointer">
            {hasStarted ? 'Restart Simulation' : 'Start Simulation'}
          </button>
          <Link to="/try-locally" className="btn-ghost px-6 py-3 text-base cursor-pointer">
            Skip simulation — run it locally
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StageCard number={1} title="Start a simulated run" description="Two browser-only workers advance training and create pretend checkpoint records." status={phase === 'idle' ? 'active' : 'complete'} tone="ok" />
        <StageCard number={2} title="Kill a simulated worker" description="The button changes local page state. It does not send a command to any server." status={!hasStarted ? 'waiting' : hasFailed ? 'complete' : 'active'} tone="err" />
        <StageCard number={3} title="Watch simulated recovery" description="The demo restores the last save point and continues the simulated training counter." status={hasRecovered ? 'complete' : phase === 'failed' || phase === 'recovering' ? 'active' : 'waiting'} tone="recover" />
      </section>

      {hasStarted && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-txt-1">Simulated training workers</h3>
                  <span className="badge-xs bg-brand-violet/10 text-brand-violet">not real servers</span>
                </div>
                <p className="text-sm text-txt-3 mt-1">Wait for the first simulated save point, then stop either worker.</p>
              </div>
              <span className={`text-xs font-mono font-semibold ${phase === 'failed' ? 'text-err' : phase === 'recovering' ? 'text-recover' : 'text-ok'}`}>
                {phaseLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {['sim-worker-0', 'sim-worker-1'].map((worker, index) => {
                const isKilled = killedWorker === worker && (phase === 'failed' || phase === 'recovering');
                const isPaused = killedWorker !== worker && (phase === 'failed' || phase === 'recovering');
                const displayedStep = isKilled || isPaused ? killStep ?? step : step;

                return (
                  <motion.div
                    key={worker}
                    animate={isKilled && phase === 'failed' ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
                    className={`card px-4 py-4 transition-colors ${isKilled ? 'border-err/30 bg-err-muted/10' : isPaused ? 'border-recover/30 bg-recover-muted/10' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${isKilled ? 'bg-err' : isPaused ? 'bg-recover animate-pulse motion-reduce:animate-none' : 'bg-ok animate-pulse motion-reduce:animate-none'}`} />
                        <div>
                          <p className="text-sm font-semibold text-txt-1">Worker {index}</p>
                          <p className="text-xs text-txt-3 font-mono">{worker}</p>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-semibold tabular-nums text-ok">Step {displayedStep}</span>
                    </div>

                    <button
                      onClick={() => killSimulatedWorker(worker)}
                      disabled={!canKill}
                      className={`w-full py-3 rounded-xl text-sm font-bold border transition-colors ${
                        canKill
                          ? 'bg-err/15 text-err hover:bg-err/25 border-err/30 cursor-pointer'
                          : isKilled
                            ? 'bg-err-muted text-err border-err/20 cursor-not-allowed'
                            : isPaused
                              ? 'bg-recover-muted text-recover border-recover/20 cursor-not-allowed'
                              : 'bg-surface-3 text-txt-3 border-line cursor-not-allowed'
                      }`}
                    >
                      {isKilled
                        ? `Simulated Worker ${index} Stopped`
                        : isPaused
                          ? `Worker ${index} Paused for Recovery`
                          : canKill
                            ? `Kill Simulated Worker ${index}`
                            : phase === 'recovered'
                              ? `Worker ${index} Recovered — Restart to Run Again`
                              : `Worker ${index} Waiting for First Save Point`}
                    </button>
                    <p className="text-xs text-txt-3 text-center mt-2">Browser interaction only — no backend command</p>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <AnimatePresence>
            {(phase === 'failed' || phase === 'recovering') && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={`card px-5 py-4 border ${phase === 'failed' ? 'border-err/30 bg-err-muted/10' : 'border-recover/30 bg-recover-muted/10'}`}
              >
                <p role="status" className={`text-sm font-bold ${phase === 'failed' ? 'text-err' : 'text-recover'}`}>
                  {phase === 'failed' ? 'Simulated failure detected' : 'Simulated checkpoint recovery in progress'}
                </p>
                <p className="text-sm text-txt-2 mt-1">
                  {phase === 'failed' ? 'The browser is waiting for the pretend heartbeat timeout.' : `Restoring step ${latestCheckpoint?.step ?? 0} from the last simulated save point.`}
                  {' '}Elapsed: {recoverySeconds.toFixed(1)}s
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {hasRecovered && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card p-5 border-ok/30 bg-ok-muted/5" aria-live="polite">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-ok flex items-center justify-center text-surface-0 font-bold flex-shrink-0">✓</div>
                <div>
                  <h3 className="text-base font-bold text-ok">Simulation recovered successfully</h3>
                  <p className="text-sm text-txt-2 mt-1 leading-relaxed">
                    The counter was restored from step {restoredStep} after the simulated interruption at step {killStep}.
                    Training is continuing in this tab. This demonstrates the interface flow; it is not proof of a live backend recovery.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Training Step', step.toString(), 'Simulated counter'],
              ['Checkpoints', checkpoints.length.toString(), 'Simulated save points'],
              ['Current Loss', currentLoss, 'Deterministic browser value'],
              ['Active Workers', phase === 'failed' ? '0/2' : phase === 'recovering' ? '0/2' : '2/2', 'Simulated workers'],
            ].map(([label, value, hint]) => (
              <div key={label} className="card p-4">
                <p className="text-2xs font-semibold text-txt-3 uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-bold text-txt-1 mt-1 tabular-nums">{value}</p>
                <p className="text-xs text-txt-3 mt-1">{hint}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
            <div className="space-y-4 min-w-0">
              <SimulationPipeline phase={phase} />

              <div className="card p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-base font-bold text-txt-1">Simulated training loss</h3>
                    <p className="text-sm text-txt-3 mt-0.5">A deterministic illustration, not measured telemetry.</p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-info">{currentLoss}</span>
                </div>
                <div className="h-40 rounded-lg bg-surface-2 border border-line/60 p-3">
                  <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="w-full h-full" role="img" aria-label="Simulated loss curve">
                    <path d="M0 9 H100 M0 18 H100 M0 27 H100" stroke="currentColor" className="text-line" strokeWidth="0.3" />
                    <polyline points={chartPoints} fill="none" stroke="currentColor" className="text-info" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  </svg>
                </div>
              </div>

              <div className="card p-4">
                <h3 className="text-base font-bold text-txt-1">Simulated event timeline</h3>
                <p className="text-sm text-txt-3 mt-0.5 mb-3">Every entry is generated by the page, not a server.</p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto" aria-live="polite">
                  {timeline.map(event => (
                    <div key={event.id} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border-l-2 ${EVENT_COLORS[event.type]}`}>
                      <span className="text-xs font-mono text-txt-3 whitespace-nowrap mt-0.5">+{(event.time / 1000).toFixed(1)}s</span>
                      <span className="text-sm">{event.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="card p-4 border-brand-violet/20">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-txt-1">What is real here?</h3>
                  <span className="badge-xs bg-brand-violet/10 text-brand-violet">clear boundary</span>
                </div>
                <div className="space-y-3 mt-4 text-sm">
                  <div className="flex items-center justify-between gap-3"><span className="text-txt-3">Hetzner backend</span><span className="font-semibold text-warn">Being retired</span></div>
                  <div className="flex items-center justify-between gap-3"><span className="text-txt-3">This simulation</span><span className="font-semibold text-ok">Running in browser</span></div>
                  <div className="flex items-center justify-between gap-3"><span className="text-txt-3">API requests</span><span className="font-semibold text-txt-1">None</span></div>
                  <div className="flex items-center justify-between gap-3"><span className="text-txt-3">Real deployment</span><Link to="/try-locally" className="font-semibold text-brand-violet hover:underline">Run locally →</Link></div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div><h3 className="text-sm font-bold text-txt-1">Simulated checkpoint storage</h3><p className="text-xs text-txt-3 mt-0.5">Records exist only in page memory.</p></div>
                  <span className="badge-xs bg-info-muted text-info">mock data</span>
                </div>
                {checkpoints.length === 0 ? (
                  <p className="text-sm text-txt-3 py-4">The first simulated save point appears at step 50.</p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {[...checkpoints].reverse().slice(0, 6).map(checkpoint => (
                      <div key={checkpoint.step} className="rounded-lg bg-surface-2 px-3 py-2">
                        <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-txt-1">Step {checkpoint.step}</span><span className="text-xs text-txt-3">{checkpoint.size}</span></div>
                        <p className="text-[10px] text-txt-3 font-mono truncate mt-1">{checkpoint.hash}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card p-4 bg-[#0b0d12] border-line/60">
                <div className="flex items-center justify-between gap-2 mb-3"><h3 className="text-sm font-bold text-white">Simulated stdout</h3><span className="text-[10px] text-slate-400 font-mono">local page state</span></div>
                <div className="space-y-1.5 font-mono text-[11px] leading-relaxed max-h-56 overflow-y-auto">
                  {logs.map((line, index) => <p key={`${index}-${line}`} className="text-slate-300"><span className="text-emerald-400">›</span> {line}</p>)}
                </div>
              </div>
            </aside>
          </div>
        </motion.section>
      )}

      <section className="card p-6 sm:p-8 text-center border-brand-violet/20">
        <h2 className="text-2xl font-bold text-txt-1">Want the real checkpoint system?</h2>
        <p className="text-base text-txt-2 max-w-2xl mx-auto mt-2 mb-6">
          Run the services on your own computer. The local guide uses the real control plane, workers, storage, and recovery flow without a paid cloud backend.
        </p>
        <Link to="/try-locally" className="btn-primary inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold cursor-pointer">
          Open the local setup guide
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
        </Link>
      </section>
    </div>
    </MotionConfig>
  );
}
