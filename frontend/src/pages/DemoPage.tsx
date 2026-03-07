import { useState, useEffect, useRef, useCallback } from 'react';
import type { RunStatus, RunState, WorkerInfo, CheckpointInfo } from '../types';
import { API_BASE } from '../config/api';
import ContainerStatus from '../components/ContainerStatus';
import LogStream from '../components/LogStream';
import StorageBrowser from '../components/StorageBrowser';
import SystemInfo from '../components/SystemInfo';
import DemoWalkthrough from '../components/DemoWalkthrough';
import VisitorStats from '../components/VisitorStats';
import ActivityFeed from '../components/ActivityFeed';
import { RUN_STATE_CONFIG, WORKER_DOT, formatBytes, shortId } from '../design';
import { RunBadge, MetricCard, LiveDot } from '../components/ui';

// ── Timeline event ──────────────────────────────────────────────────────────

interface TimelineEvent {
  time: number;
  label: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

const EVENT_COLORS = {
  info: 'border-l-info bg-info-muted text-info',
  success: 'border-l-ok bg-ok-muted text-ok',
  warning: 'border-l-warn bg-warn-muted text-warn',
  error: 'border-l-err bg-err-muted text-err',
};

const STATUS_HEADLINE: Partial<Record<RunState, string>> = {
  RUNNING: 'Training in Progress',
  FAILED: 'Worker Failure Detected',
  RECOVERING: 'Recovering from Checkpoint...',
  CHECKPOINTING: 'Saving Checkpoint...',
  COMMITTED: 'Checkpoint Committed',
};

// ── State-specific left border class ────────────────────────────────────────

const STATE_BORDER: Partial<Record<RunState, string>> = {
  RUNNING: 'border-l-ok',
  FAILED: 'border-l-err',
  RECOVERING: 'border-l-recover',
  CHECKPOINTING: 'border-l-warn',
  COMMITTED: 'border-l-info',
};

// ── Main DemoPage ───────────────────────────────────────────────────────────

export default function DemoPage() {
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunStatus | null>(null);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [starting, setStarting] = useState(false);
  const [killing, setKilling] = useState<string | null>(null);
  const [recoveryBanner, setRecoveryBanner] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const [hasKilled, setHasKilled] = useState(false);
  const prevStateRef = useRef<RunState | null>(null);
  const startTimeRef = useRef<number>(0);
  const checkpointCountRef = useRef<number>(0);

  const addEvent = useCallback((label: string, type: TimelineEvent['type'] = 'info') => {
    setTimeline(prev => [...prev, {
      time: Date.now() - startTimeRef.current,
      label,
      type,
    }]);
  }, []);

  // Poll run status
  useEffect(() => {
    if (!runId) return;
    const poll = async () => {
      try {
        const [runRes, workersRes, cpRes] = await Promise.all([
          fetch(`${API_BASE}/api/runs/${runId}`),
          fetch(`${API_BASE}/api/workers?run_id=${runId}`),
          fetch(`${API_BASE}/api/runs/${runId}/checkpoints`),
        ]);
        if (runRes.ok) {
          const data: RunStatus = await runRes.json();
          setRun(data);

          // Detect state changes and add timeline events
          if (prevStateRef.current && prevStateRef.current !== data.state) {
            const label = `Run state: ${prevStateRef.current} \u2192 ${data.state}`;
            const type = data.state === 'FAILED' ? 'error'
              : data.state === 'RECOVERING' ? 'warning'
              : data.state === 'RUNNING' && (prevStateRef.current === 'RECOVERING' || prevStateRef.current === 'COMMITTED') ? 'success'
              : 'info';
            addEvent(label, type);

            // Walkthrough auto-advance: failure detected
            if (data.state === 'FAILED' && hasKilled) {
              setWalkthroughStep(3);
            }

            // Show recovery success banner + walkthrough advance
            if (data.state === 'RUNNING' && (prevStateRef.current === 'RECOVERING' || prevStateRef.current === 'FAILED')) {
              setRecoveryBanner(true);
              setTimeout(() => setRecoveryBanner(false), 8000);
              if (hasKilled) {
                setWalkthroughStep(4);
              }
            }
          }
          prevStateRef.current = data.state;
        }
        if (workersRes.ok) setWorkers(await workersRes.json());
        if (cpRes.ok) {
          const cps: CheckpointInfo[] = await cpRes.json();
          // Detect new checkpoints using ref to avoid dependency loop
          if (cps.length > checkpointCountRef.current) {
            const newest = cps[cps.length - 1];
            if (newest.state === 'COMMITTED') {
              addEvent(
                `Checkpoint committed: step ${newest.step} (${formatBytes(newest.total_bytes)})`,
                'success',
              );
              // Walkthrough auto-advance
              if (checkpointCountRef.current === 0) {
                setWalkthroughStep(1); // first checkpoint -> step 2
              }
              if (cps.filter(c => c.state === 'COMMITTED').length >= 2 && !hasKilled) {
                setWalkthroughStep(2); // ready to kill
              }
            }
          }
          checkpointCountRef.current = cps.length;
          setCheckpoints(cps);
        }
      } catch { /* ignore polling errors */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [runId, addEvent, hasKilled]);

  // Start demo
  const handleStart = async () => {
    setStarting(true);
    setTimeline([]);
    setWalkthroughStep(0);
    setHasKilled(false);
    startTimeRef.current = Date.now();
    prevStateRef.current = null;

    try {
      addEvent('Waiting for training workers to create run...', 'info');

      let foundRunId: string | null = null;
      for (let i = 0; i < 30; i++) {
        const res = await fetch(`${API_BASE}/api/runs`);
        if (res.ok) {
          const runs: RunStatus[] = await res.json();
          const active = runs.find(r => r.state === 'RUNNING' || r.state === 'CHECKPOINTING' || r.state === 'COMMITTED');
          if (active) {
            foundRunId = active.run_id;
            break;
          }
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      if (foundRunId) {
        setRunId(foundRunId);
        addEvent(`Connected to run ${foundRunId.slice(0, 8)}...`, 'success');
      } else {
        addEvent('No active runs found. Ensure workers are running.', 'error');
      }
    } catch (e) {
      addEvent(`Failed to start demo: ${e}`, 'error');
    } finally {
      setStarting(false);
    }
  };

  // Kill worker
  const handleKillWorker = async (containerName: string) => {
    setKilling(containerName);
    setHasKilled(true);
    addEvent(`Killing container: ${containerName}`, 'error');

    try {
      const res = await fetch(`${API_BASE}/api/demo/kill-worker/${containerName}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addEvent(`Container ${containerName} killed. Waiting for failure detection...`, 'warning');
      } else {
        addEvent(`Failed to kill ${containerName}: ${data.output || 'unknown error'}`, 'error');
      }
    } catch (e) {
      addEvent(`Kill request failed: ${e}`, 'error');
    } finally {
      setKilling(null);
    }
  };

  const committedCheckpoints = checkpoints.filter(cp => cp.state === 'COMMITTED');
  const totalBytes = committedCheckpoints.reduce((sum, cp) => sum + cp.total_bytes, 0);

  // Get the two most relevant workers: prefer ACTIVE, then most recent heartbeat.
  const relevantWorkers = [...workers]
    .sort((a, b) => {
      if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
      if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1;
      return new Date(b.last_heartbeat).getTime() - new Date(a.last_heartbeat).getTime();
    })
    .slice(0, 2);

  const stateConfig = run ? (RUN_STATE_CONFIG[run.state] ?? RUN_STATE_CONFIG.CREATED) : RUN_STATE_CONFIG.CREATED;
  const borderClass = run ? (STATE_BORDER[run.state] ?? 'border-l-line') : 'border-l-line';

  // ── Pre-start hero ──────────────────────────────────────────────────────────

  if (!runId && !starting) {
    return (
      <div className="max-w-4xl mx-auto py-12 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-5">
          <h1 className="text-3xl font-bold text-txt-1 tracking-tight">
            Watch AI Training Survive a Crash
          </h1>
          <p className="text-txt-2 text-sm max-w-xl mx-auto leading-relaxed">
            This demo runs a real AI training job across multiple computers. You get to crash one on purpose
            and watch the system recover automatically -- no progress lost. Everything you see is live infrastructure,
            not a simulation.
          </p>
          <button
            onClick={handleStart}
            disabled={starting}
            className="btn-primary px-8 py-3.5 text-base cursor-pointer"
          >
            Start Demo
          </button>
        </div>

        {/* 3-step instruction cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-5 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-ok-muted flex items-center justify-center text-ok font-mono font-bold text-sm">
              1
            </div>
            <p className="text-sm font-medium text-txt-1">Launch Training</p>
            <p className="text-2xs text-txt-3 leading-relaxed">
              Two computers start teaching an AI model together, automatically saving their progress along the way.
            </p>
          </div>
          <div className="card p-5 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-err-muted flex items-center justify-center text-err font-mono font-bold text-sm">
              2
            </div>
            <p className="text-sm font-medium text-txt-1">Crash a Computer</p>
            <p className="text-2xs text-txt-3 leading-relaxed">
              Click "Kill" to pull the plug on one of the training computers. The system will notice something is wrong.
            </p>
          </div>
          <div className="card p-5 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-info-muted flex items-center justify-center text-info font-mono font-bold text-sm">
              3
            </div>
            <p className="text-sm font-medium text-txt-1">Watch It Recover</p>
            <p className="text-2xs text-txt-3 leading-relaxed">
              The crashed computer restarts, reloads its last save point from storage, and picks up right where it left off.
            </p>
          </div>
        </div>

        {/* Proof panels grid */}
        <div className="space-y-3">
          <p className="text-2xs text-txt-3 text-center uppercase tracking-widest">
            Live infrastructure &mdash; not a simulation
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <VisitorStats />
            <ActivityFeed />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SystemInfo />
            <ContainerStatus />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="card p-4">
              <div className="panel-header mb-2">
                <span className="panel-tag">stdout</span>
                <h4 className="panel-title">Live Logs</h4>
              </div>
              <p className="text-2xs text-txt-3">Available after starting demo</p>
            </div>
            <StorageBrowser active={false} />
          </div>
        </div>
      </div>
    );
  }

  // ── Connecting state ────────────────────────────────────────────────────────

  if (!runId && starting) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <svg className="animate-spin h-6 w-6 text-brand-violet" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-txt-2">Connecting to training workers...</p>
      </div>
    );
  }

  // ── Running state (2-column mission control) ──────────────────────────────

  return (
    <div className="space-y-4">
      {/* Walkthrough bar */}
      {runId && <DemoWalkthrough currentStep={walkthroughStep} />}

      {runId && run && (
        <div className="flex gap-4">
          {/* ─── Left Column: Main Demo ─── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Status Banner */}
            <div className={`glass-strong border-l-2 ${borderClass} overflow-hidden`}>
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${stateConfig.dot}`} />
                  <div>
                    <h3 className="text-base font-semibold text-txt-1">
                      {STATUS_HEADLINE[run.state] ?? run.state}
                    </h3>
                    <p className="text-2xs text-txt-3 font-mono">
                      Run {shortId(run.run_id, 8)} &middot; Step {run.current_step}
                    </p>
                  </div>
                </div>
                <RunBadge state={run.state} size="md" />
              </div>
            </div>

            {/* Recovery Success Banner */}
            {recoveryBanner && (
              <div className="glass-strong border border-ok/30 bg-ok-muted p-4">
                <div className="flex items-center gap-3">
                  <LiveDot />
                  <div>
                    <p className="text-ok text-sm font-semibold">Recovery Successful</p>
                    <p className="text-txt-3 text-2xs">
                      Training resumed from last checkpoint. No data was lost.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Metric Cards */}
            <div className="grid grid-cols-4 gap-3">
              <MetricCard label="Training Step" value={run.current_step} hint="How far along the AI model is in learning" />
              <MetricCard label="Checkpoints" value={committedCheckpoints.length} hint="Save points so progress isn't lost" />
              <MetricCard label="Data Saved" value={formatBytes(totalBytes)} hint="The AI's brain backed up to storage" />
              <MetricCard
                label="Active Workers"
                value={`${workers.filter(w => w.status === 'ACTIVE').length}/2`}
                hint="Computers working together on training"
              />
            </div>

            {/* Workers + Kill Buttons */}
            <div className="card p-4">
              <h3 className="panel-title mb-3">Training Workers</h3>
              <div className="grid grid-cols-2 gap-3">
                {['ckpt-worker-0', 'ckpt-worker-1'].map((container, idx) => {
                  const worker = relevantWorkers[idx];
                  const isAlive = worker?.status === 'ACTIVE';
                  const dotColor = WORKER_DOT[worker?.status ?? 'DEAD'] ?? 'bg-muted';

                  return (
                    <div
                      key={container}
                      className="card px-3 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                          <div>
                            <p className="text-sm font-medium text-txt-1">Worker {idx}</p>
                            <p className="text-2xs text-txt-3 font-mono">{container}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {worker && (
                            <span className="text-2xs text-txt-3 font-mono">
                              Step {worker.current_step}
                            </span>
                          )}
                          <button
                            onClick={() => handleKillWorker(container)}
                            disabled={killing !== null || !isAlive}
                            className="btn-danger px-2.5 py-1 text-2xs cursor-pointer"
                          >
                            {killing === container ? 'Killing...' : 'Kill'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Event Timeline */}
            <div className="card p-4">
              <h3 className="panel-title mb-3">Event Timeline</h3>
              {timeline.length === 0 ? (
                <p className="text-2xs text-txt-3">Events will appear here as they happen...</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {timeline.map((event, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border-l-2 ${EVENT_COLORS[event.type]}`}
                    >
                      <span className="text-2xs font-mono text-txt-3 whitespace-nowrap mt-0.5">
                        +{(event.time / 1000).toFixed(1)}s
                      </span>
                      <span className="text-xs">{event.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Checkpoint History */}
            {committedCheckpoints.length > 0 && (
              <div className="card p-4">
                <h3 className="panel-title mb-3">Checkpoint History</h3>
                <div className="space-y-1.5">
                  {committedCheckpoints.slice(-8).reverse().map(cp => (
                    <div
                      key={cp.checkpoint_id}
                      className="flex items-center justify-between px-2.5 py-1.5 bg-surface-2 rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-info" />
                        <span className="text-xs text-txt-2">Step {cp.step}</span>
                      </div>
                      <div className="flex items-center gap-3 text-2xs text-txt-3">
                        <span>{cp.num_shards} shard{cp.num_shards !== 1 ? 's' : ''}</span>
                        <span>{formatBytes(cp.total_bytes)}</span>
                        <span className="font-mono">{shortId(cp.checkpoint_id, 8)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Right Column: Proof Panels ─── */}
          <div className="w-[380px] flex-shrink-0 space-y-3">
            <VisitorStats />
            <ActivityFeed />
            <SystemInfo />
            <ContainerStatus />
            <LogStream active={!!runId} />
            <StorageBrowser active={!!runId} />
          </div>
        </div>
      )}
    </div>
  );
}
