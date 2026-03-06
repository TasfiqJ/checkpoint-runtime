import { useState, useEffect, useRef, useCallback } from 'react';
import type { RunStatus, RunState, WorkerInfo, CheckpointInfo } from '../types';
import { API_BASE } from '../config/api';
import ContainerStatus from '../components/ContainerStatus';
import LogStream from '../components/LogStream';
import StorageBrowser from '../components/StorageBrowser';
import SystemInfo from '../components/SystemInfo';
import DemoWalkthrough from '../components/DemoWalkthrough';

// ── State colours ───────────────────────────────────────────────────────────

const STATE_STYLES: Record<RunState, string> = {
  CREATED:       'bg-gray-700/50 text-gray-300',
  RUNNING:       'bg-green-900/50 text-green-400',
  CHECKPOINTING: 'bg-yellow-900/50 text-yellow-400',
  COMMITTED:     'bg-blue-900/50 text-blue-400',
  FAILED:        'bg-red-900/50 text-red-400',
  RECOVERING:    'bg-orange-900/50 text-orange-400',
  CANCELLED:     'bg-gray-700/50 text-gray-400',
  COMPLETED:     'bg-blue-900/50 text-blue-400',
};

const STATE_DOT: Record<string, string> = {
  ACTIVE: 'bg-green-400',
  DEAD: 'bg-red-500',
  DRAINING: 'bg-yellow-400',
};

function StateBadge({ state }: { state: RunState }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATE_STYLES[state] ?? 'bg-gray-700/50 text-gray-300'}`}>
      {state}
    </span>
  );
}

// ── Timeline event ──────────────────────────────────────────────────────────

interface TimelineEvent {
  time: number;
  label: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

const EVENT_COLORS = {
  info: 'border-blue-500 bg-blue-500/10 text-blue-300',
  success: 'border-green-500 bg-green-500/10 text-green-300',
  warning: 'border-yellow-500 bg-yellow-500/10 text-yellow-300',
  error: 'border-red-500 bg-red-500/10 text-red-300',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

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
            const label = `Run state: ${prevStateRef.current} → ${data.state}`;
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
                setWalkthroughStep(1); // first checkpoint → step 2
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Live Demo</h2>
          <p className="text-sm text-gray-400 mt-1">
            Watch fault-tolerant checkpointing in action. Kill a worker and see automatic recovery.
          </p>
        </div>
        {!runId && (
          <button
            onClick={handleStart}
            disabled={starting}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors text-lg"
          >
            {starting ? 'Connecting...' : 'Start Demo'}
          </button>
        )}
      </div>

      {/* Walkthrough (shown after starting) */}
      {runId && <DemoWalkthrough currentStep={walkthroughStep} />}

      {runId && run && (
        <div className="flex gap-4">
          {/* ─── Left Column: Main Demo ─── */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Status Banner */}
            <div className={`rounded-xl border p-4 ${
              run.state === 'RUNNING' ? 'border-green-800 bg-green-950/30' :
              run.state === 'FAILED' ? 'border-red-800 bg-red-950/30' :
              run.state === 'RECOVERING' ? 'border-orange-800 bg-orange-950/30' :
              run.state === 'CHECKPOINTING' ? 'border-yellow-800 bg-yellow-950/30' :
              'border-gray-800 bg-gray-900/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${
                    run.state === 'RUNNING' ? 'bg-green-400' :
                    run.state === 'FAILED' ? 'bg-red-500' :
                    run.state === 'RECOVERING' ? 'bg-orange-400' :
                    'bg-yellow-400'
                  }`} />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-100">
                      {run.state === 'RUNNING' ? 'Training in Progress' :
                       run.state === 'FAILED' ? 'Worker Failure Detected' :
                       run.state === 'RECOVERING' ? 'Recovering from Checkpoint...' :
                       run.state === 'CHECKPOINTING' ? 'Saving Checkpoint...' :
                       run.state}
                    </h3>
                    <p className="text-xs text-gray-400">
                      Run {run.run_id.slice(0, 8)} &middot; Step {run.current_step}
                    </p>
                  </div>
                </div>
                <StateBadge state={run.state} />
              </div>
            </div>

            {/* Recovery Success Banner */}
            {recoveryBanner && (
              <div className="rounded-xl border border-green-500 bg-green-950/40 p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">&#10003;</span>
                  <div>
                    <p className="text-green-300 font-semibold">Recovery Successful</p>
                    <p className="text-green-400/70 text-sm">
                      Training resumed from last checkpoint. No data was lost.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Training Step</p>
                <p className="text-xl font-mono font-bold text-gray-100 mt-1">{run.current_step}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Checkpoints</p>
                <p className="text-xl font-mono font-bold text-gray-100 mt-1">{committedCheckpoints.length}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Data Saved</p>
                <p className="text-xl font-mono font-bold text-gray-100 mt-1">{formatBytes(totalBytes)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Active Workers</p>
                <p className="text-xl font-mono font-bold text-gray-100 mt-1">
                  {workers.filter(w => w.status === 'ACTIVE').length}/{workers.length}
                </p>
              </div>
            </div>

            {/* Workers + Kill Buttons */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-100 mb-3">Training Workers</h3>
              <div className="grid grid-cols-2 gap-3">
                {['ckpt-worker-0', 'ckpt-worker-1'].map((container, idx) => {
                  const worker = workers.find(w => w.rank === idx);
                  const isAlive = worker?.status === 'ACTIVE';

                  return (
                    <div
                      key={container}
                      className={`rounded-lg border p-3 ${
                        isAlive
                          ? 'border-green-800/50 bg-green-950/20'
                          : 'border-red-800/50 bg-red-950/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${STATE_DOT[worker?.status ?? 'DEAD'] ?? 'bg-gray-500'}`} />
                          <div>
                            <p className="text-sm font-medium text-gray-200">Worker {idx}</p>
                            <p className="text-[10px] text-gray-500 font-mono">{container}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {worker && (
                            <span className="text-[10px] text-gray-400">
                              Step {worker.current_step}
                            </span>
                          )}
                          <button
                            onClick={() => handleKillWorker(container)}
                            disabled={killing !== null || !isAlive}
                            className="px-2.5 py-1 bg-red-900/50 hover:bg-red-800 disabled:bg-gray-800 disabled:text-gray-600 text-red-300 text-xs font-medium rounded-md transition-colors"
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

            {/* Recovery Timeline */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-100 mb-3">Event Timeline</h3>
              {timeline.length === 0 ? (
                <p className="text-xs text-gray-500">Events will appear here as they happen...</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {timeline.map((event, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 px-2 py-1.5 rounded-md border-l-2 ${EVENT_COLORS[event.type]}`}
                    >
                      <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap mt-0.5">
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
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-100 mb-3">Checkpoint History</h3>
                <div className="space-y-1.5">
                  {committedCheckpoints.slice(-8).reverse().map(cp => (
                    <div
                      key={cp.checkpoint_id}
                      className="flex items-center justify-between px-2 py-1.5 bg-gray-800/50 rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        <span className="text-xs text-gray-300">Step {cp.step}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span>{cp.num_shards} shard{cp.num_shards !== 1 ? 's' : ''}</span>
                        <span>{formatBytes(cp.total_bytes)}</span>
                        <span className="font-mono">{cp.checkpoint_id.slice(0, 8)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Right Column: Proof Panels ─── */}
          <div className="w-[380px] flex-shrink-0 space-y-3">
            <SystemInfo />
            <ContainerStatus />
            <LogStream active={!!runId} />
            <StorageBrowser active={!!runId} />
          </div>
        </div>
      )}

      {/* Instructions (before starting) */}
      {!runId && !starting && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <h3 className="text-xl font-semibold text-gray-100 mb-4">
            Fault-Tolerant Distributed Checkpointing
          </h3>
          <div className="max-w-2xl mx-auto space-y-4 text-gray-400 text-sm">
            <p>
              This demo showcases a production-grade checkpoint runtime that saves ML training
              state to a distributed data plane. When a worker fails, training automatically
              resumes from the last committed checkpoint.
            </p>
            <div className="grid grid-cols-3 gap-6 mt-8 text-left">
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-lg bg-green-900/50 flex items-center justify-center text-green-400 font-bold">1</div>
                <p className="font-medium text-gray-200">Start Demo</p>
                <p className="text-xs">Workers begin training and periodically save checkpoints through the data plane to S3.</p>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-lg bg-red-900/50 flex items-center justify-center text-red-400 font-bold">2</div>
                <p className="font-medium text-gray-200">Kill a Worker</p>
                <p className="text-xs">Click "Kill" to simulate a node failure. The control plane detects the missed heartbeats.</p>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-lg bg-blue-900/50 flex items-center justify-center text-blue-400 font-bold">3</div>
                <p className="font-medium text-gray-200">Watch Recovery</p>
                <p className="text-xs">The worker automatically restarts, loads the last checkpoint from S3, and resumes training from where it left off.</p>
              </div>
            </div>
          </div>

          {/* Proof panels are still visible before starting */}
          <div className="mt-8 pt-6 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-4">
              These panels show live infrastructure data — not a simulation
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left mb-3">
              <SystemInfo />
              <ContainerStatus />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <div className="px-1 py-1 flex items-center gap-2">
                  <span className="text-[10px] font-mono bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">stdout</span>
                  <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Live Logs</h4>
                </div>
                <p className="text-[10px] text-gray-500 mt-2">Available after starting demo</p>
              </div>
              <StorageBrowser active={false} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
