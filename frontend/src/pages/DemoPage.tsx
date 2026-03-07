import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
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

const STATUS_EXPLAIN: Partial<Record<RunState, string>> = {
  RUNNING: 'Both workers are training the AI model together. Checkpoints are being saved automatically every 50 steps.',
  FAILED: 'The system detected a worker stopped sending heartbeats. It\'s about to start recovery.',
  RECOVERING: 'The crashed worker is restarting and loading the last saved checkpoint from storage.',
  CHECKPOINTING: 'The system is saving the AI model\'s current state to storage right now.',
  COMMITTED: 'A checkpoint was just saved successfully. Training continues.',
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
      <div className="max-w-4xl mx-auto py-12 space-y-12">
        {/* Hero */}
        <div className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-ok-muted text-ok text-xs font-semibold px-3 py-1 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-ok" />
            </span>
            Live Infrastructure Running
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-txt-1 tracking-tight leading-tight">
            I built this so you can break it.
            <br />
            <span className="font-serif italic">Watch it recover on its own.</span>
          </h1>

          <p className="text-txt-2 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
            I set up two <span className="text-txt-1 font-medium">real servers</span> training an AI model right now
            on a cloud machine in Virginia. You'll crash one on purpose and see my system
            detect the failure, restart the server, and recover with zero data loss.
          </p>

          <button
            onClick={handleStart}
            disabled={starting}
            className="btn-primary px-10 py-4 text-lg cursor-pointer"
          >
            Start the Demo
          </button>
        </div>

        {/* What will happen - step by step */}
        <div>
          <h2 className="text-2xl font-bold text-txt-1 text-center mb-2">
            What's going to happen
          </h2>
          <p className="text-base text-txt-3 text-center mb-8">
            The demo has 3 stages and takes about 30 seconds
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="card p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ok-muted flex items-center justify-center text-ok font-bold text-base">
                  1
                </div>
                <h3 className="text-lg font-bold text-txt-1">Training Starts</h3>
              </div>
              <p className="text-base text-txt-2 leading-relaxed">
                Two servers begin training an AI model. You'll see the <span className="text-txt-1 font-medium">step counter climbing</span> and{' '}
                <span className="text-txt-1 font-medium">checkpoints saving</span> automatically every 50 steps,
                like auto-save in a video game.
              </p>
            </div>

            <div className="card p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-err-muted flex items-center justify-center text-err font-bold text-base">
                  2
                </div>
                <h3 className="text-lg font-bold text-txt-1">You Crash a Server</h3>
              </div>
              <p className="text-base text-txt-2 leading-relaxed">
                You press a <span className="text-err font-medium">"Kill" button</span> to destroy one of the training servers.
                This sends a real{' '}
                <code className="text-xs bg-surface-3 px-1 py-0.5 rounded text-txt-3 font-mono">docker kill</code>{' '}
                command, and the container actually shuts down on the server.
              </p>
            </div>

            <div className="card p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-info-muted flex items-center justify-center text-info font-bold text-base">
                  3
                </div>
                <h3 className="text-lg font-bold text-txt-1">Auto-Recovery</h3>
              </div>
              <p className="text-base text-txt-2 leading-relaxed">
                The system <span className="text-txt-1 font-medium">detects the crash</span>, restarts the server,{' '}
                <span className="text-txt-1 font-medium">loads the last save point</span> from storage, and{' '}
                <span className="text-ok font-medium">resumes training</span>, all automatically in ~5 seconds.
              </p>
            </div>
          </div>
        </div>

        {/* What you'll see (proof panels explanation) */}
        <div>
          <h2 className="text-2xl font-bold text-txt-1 text-center mb-2">
            How you'll know it's real
          </h2>
          <p className="text-base text-txt-3 text-center mb-6">
            The right side of the demo shows proof this is actual backend infrastructure
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="card px-4 py-3 flex items-start gap-3">
              <span className="panel-tag mt-0.5">stdout</span>
              <div>
                <p className="text-base font-medium text-txt-1">Live Logs</p>
                <p className="text-sm text-txt-3">Real-time output from Docker containers. You'll see heartbeats, checkpoint saves, and failure detection</p>
              </div>
            </div>
            <div className="card px-4 py-3 flex items-start gap-3">
              <span className="panel-tag mt-0.5">S3</span>
              <div>
                <p className="text-base font-medium text-txt-1">Storage Browser</p>
                <p className="text-sm text-txt-3">Real MinIO files appearing as checkpoints are saved, with SHA-256 hashes proving data integrity</p>
              </div>
            </div>
            <div className="card px-4 py-3 flex items-start gap-3">
              <span className="panel-tag mt-0.5">docker</span>
              <div>
                <p className="text-base font-medium text-txt-1">Container Status</p>
                <p className="text-sm text-txt-3">Live Docker container list. Watch the killed container go down and come back up</p>
              </div>
            </div>
            <div className="card px-4 py-3 flex items-start gap-3">
              <span className="panel-tag mt-0.5">sys</span>
              <div>
                <p className="text-base font-medium text-txt-1">Server Info</p>
                <p className="text-sm text-txt-3">Real hostname, CPU, memory, and uptime from the Hetzner VPS in Virginia</p>
              </div>
            </div>
          </div>
        </div>

        {/* Live panels preview */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <VisitorStats />
            <ActivityFeed />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SystemInfo />
            <ContainerStatus />
          </div>
        </div>

        {/* Dashboard links */}
        <div className="border-t border-line pt-10">
          <p className="text-xs font-semibold text-txt-3 uppercase tracking-widest mb-4 text-center">Operator Dashboard</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link to="/runs" className="card px-4 py-3 text-center hover:shadow-glow-sm transition-shadow group">
              <p className="text-sm font-semibold text-txt-1 group-hover:text-brand-violet transition-colors">Training Runs</p>
              <p className="text-xs text-txt-3 mt-0.5">Run lifecycle + state</p>
            </Link>
            <Link to="/checkpoints" className="card px-4 py-3 text-center hover:shadow-glow-sm transition-shadow group">
              <p className="text-sm font-semibold text-txt-1 group-hover:text-brand-violet transition-colors">Checkpoint Browser</p>
              <p className="text-xs text-txt-3 mt-0.5">Shards + manifests</p>
            </Link>
            <Link to="/health" className="card px-4 py-3 text-center hover:shadow-glow-sm transition-shadow group">
              <p className="text-sm font-semibold text-txt-1 group-hover:text-brand-violet transition-colors">System Health</p>
              <p className="text-xs text-txt-3 mt-0.5">Worker heartbeats</p>
            </Link>
            <Link to="/performance" className="card px-4 py-3 text-center hover:shadow-glow-sm transition-shadow group">
              <p className="text-sm font-semibold text-txt-1 group-hover:text-brand-violet transition-colors">Performance Metrics</p>
              <p className="text-xs text-txt-3 mt-0.5">Latency + throughput</p>
            </Link>
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
        <p className="text-base text-txt-1 font-medium">Connecting to training workers...</p>
        <p className="text-sm text-txt-3">Looking for an active training run on the server</p>
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
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full animate-pulse ${stateConfig.dot}`} />
                    <h3 className="text-lg font-bold text-txt-1">
                      {STATUS_HEADLINE[run.state] ?? run.state}
                    </h3>
                  </div>
                  <RunBadge state={run.state} size="md" />
                </div>
                {STATUS_EXPLAIN[run.state] && (
                  <p className="text-sm text-txt-2 ml-6">
                    {STATUS_EXPLAIN[run.state]}
                  </p>
                )}
                <p className="text-2xs text-txt-3 font-mono mt-2 ml-6">
                  Run {shortId(run.run_id, 8)} &middot; Step {run.current_step}
                </p>
              </div>
            </div>

            {/* Recovery Success Banner */}
            {recoveryBanner && (
              <div className="glass-strong border border-ok/30 bg-ok-muted p-5">
                <div className="flex items-center gap-3">
                  <LiveDot />
                  <div>
                    <p className="text-ok text-base font-bold">Recovery Successful!</p>
                    <p className="text-txt-2 text-sm mt-1">
                      The crashed worker restarted, loaded the last checkpoint, and resumed training.
                      No data was lost. This is what the system is designed to do.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Metric Cards */}
            <div className="grid grid-cols-4 gap-3">
              <MetricCard label="Training Step" value={run.current_step} hint="How far along training is" />
              <MetricCard label="Checkpoints" value={committedCheckpoints.length} hint="Auto-saved progress points" />
              <MetricCard label="Data Saved" value={formatBytes(totalBytes)} hint="Total model state backed up" />
              <MetricCard
                label="Active Workers"
                value={`${workers.filter(w => w.status === 'ACTIVE').length}/2`}
                hint="Servers currently training"
              />
            </div>

            {/* Workers + Kill Buttons */}
            <div className="card p-5">
              <div className="mb-4">
                <h3 className="text-base font-bold text-txt-1">Training Workers</h3>
                <p className="text-xs text-txt-3 mt-1">
                  Each worker is a real Docker container running PyTorch.{' '}
                  <span className="text-err font-medium">Click "Kill" to shut one down</span> and the system will detect the failure and recover.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {['ckpt-worker-0', 'ckpt-worker-1'].map((container, idx) => {
                  const worker = relevantWorkers[idx];
                  const isAlive = worker?.status === 'ACTIVE';
                  const dotColor = WORKER_DOT[worker?.status ?? 'DEAD'] ?? 'bg-muted';

                  return (
                    <div
                      key={container}
                      className="card px-4 py-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                          <div>
                            <p className="text-sm font-semibold text-txt-1">Worker {idx}</p>
                            <p className="text-2xs text-txt-3 font-mono">{container}</p>
                          </div>
                        </div>
                        {worker && (
                          <span className="text-xs text-txt-3 font-mono">
                            Step {worker.current_step}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleKillWorker(container)}
                        disabled={killing !== null || !isAlive}
                        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                          isAlive && killing === null
                            ? 'bg-err-muted text-err hover:bg-err/20 border border-err/20'
                            : 'bg-surface-3 text-txt-3 border border-line cursor-not-allowed'
                        }`}
                      >
                        {killing === container ? (
                          'Killing...'
                        ) : !isAlive ? (
                          'Offline, Recovering...'
                        ) : (
                          <>Kill This Server</>
                        )}
                      </button>
                      {isAlive && killing === null && (
                        <p className="text-2xs text-txt-3 text-center mt-2">
                          Sends <code className="bg-surface-3 px-1 rounded font-mono">docker kill</code> to the real container
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Event Timeline */}
            <div className="card p-4">
              <div className="mb-3">
                <h3 className="text-base font-bold text-txt-1">Event Timeline</h3>
                <p className="text-xs text-txt-3 mt-0.5">Every state change and checkpoint is logged here in real-time</p>
              </div>
              {timeline.length === 0 ? (
                <p className="text-xs text-txt-3">Events will appear here as they happen...</p>
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
                <div className="mb-3">
                  <h3 className="text-base font-bold text-txt-1">Checkpoint History</h3>
                  <p className="text-xs text-txt-3 mt-0.5">
                    Each row is a save point, the AI model's state backed up to S3 storage
                  </p>
                </div>
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
            <div className="card px-4 py-3">
              <p className="text-xs font-semibold text-txt-1 mb-1">Proof Panels</p>
              <p className="text-2xs text-txt-3 leading-relaxed">
                Everything below is live data from the real server, not animations or mock data.
              </p>
            </div>
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
