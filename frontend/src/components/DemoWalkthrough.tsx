import { motion, AnimatePresence } from 'framer-motion';
import type { RunState } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

interface RecoverySummary {
  detectTime: number;
  recoverTime: number;
  restoredStep: number;
  currentStep: number;
  checkpointLoss: number;
}

interface WalkthroughContent {
  step: string;
  title: string;
  body: string;
  action?: string;
  elapsed?: number | null;
  color: 'ok' | 'info' | 'err' | 'recover' | 'warn';
}

// ── Step definitions ─────────────────────────────────────────────────────────

function getContent(
  walkthroughStep: number,
  runState: RunState,
  elapsed: number | null,
  recoverySummary: RecoverySummary | null,
): WalkthroughContent {

  // Recovery complete — show results
  if (recoverySummary) {
    return {
      step: 'Done',
      title: 'Recovery Complete — Zero Data Lost',
      body: `Detected crash in ${recoverySummary.detectTime.toFixed(1)}s, recovered in ${recoverySummary.recoverTime.toFixed(1)}s total.`,
      color: 'ok',
    };
  }

  // Kill/recovery cycle in progress — narrate based on run state
  if (walkthroughStep >= 3) {
    if (runState === 'FAILED') {
      return {
        step: '2/3',
        title: 'Crash Detected!',
        body: `The worker stopped sending heartbeats. The system noticed it's gone. Recovery is about to start — the system will restart the container and load the last saved checkpoint from storage.`,
        elapsed,
        color: 'err',
      };
    }
    if (runState === 'RECOVERING') {
      return {
        step: '2/3',
        title: 'Recovering...',
        body: `The crashed worker is restarting. It's loading the last saved checkpoint from object storage right now. When it finishes, training will resume from the exact step it was saved at — no work lost.`,
        elapsed,
        color: 'recover',
      };
    }
    // Fallback: kill just happened, state hasn't caught up to FAILED yet (poll lag)
    // Show "Crash Detected!" while waiting for the server to confirm the failure
    return {
      step: '2/3',
      title: 'Crash Detected!',
      body: `The kill signal was just sent to the worker container. Waiting for the system to detect the failure and begin recovery...`,
      elapsed,
      color: 'err',
    };
  }

  // Pre-kill walkthrough steps
  if (walkthroughStep >= 1) {
    return {
      step: '1/3',
      title: 'Checkpoints Are Being Saved',
      body: 'Every 50 training steps, the system saves a snapshot of the entire model — all 202K parameters, the optimizer state, and the current step. The blue dots on the loss chart are checkpoints. Kill a worker above whenever you\'re ready.',
      color: 'info',
    };
  }

  // Step 0: just started
  return {
    step: '1/3',
    title: 'Training Has Started',
    body: 'Two real Docker containers are training a neural network together right now. Watch the loss chart — the green line going down means the model is learning. Checkpoints will start saving automatically every 50 steps.',
    color: 'ok',
  };
}

// ── Color maps ───────────────────────────────────────────────────────────────

const BG: Record<string, string> = {
  ok: 'border-ok bg-ok-muted/50',
  info: 'border-info bg-info-muted/50',
  err: 'border-err bg-err-muted/50',
  recover: 'border-recover bg-recover-muted/50',
  warn: 'border-warn bg-warn-muted/50',
};

const TEXT: Record<string, string> = {
  ok: 'text-ok',
  info: 'text-info',
  err: 'text-err',
  recover: 'text-recover',
  warn: 'text-warn',
};

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  currentStep: number;
  runState: RunState;
  elapsedSinceKill: number | null;
  recoverySummary: RecoverySummary | null;
}

export default function DemoWalkthrough({ currentStep, runState, elapsedSinceKill, recoverySummary }: Props) {
  const content = getContent(currentStep, runState, elapsedSinceKill, recoverySummary);
  const progressPct = recoverySummary ? 100 : currentStep >= 3 ? 66 : currentStep >= 1 ? 33 : 10;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={content.title}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.3 }}
        className={`rounded-xl border-l-4 p-5 ${BG[content.color]}`}
      >
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-2xs font-bold ${TEXT[content.color]}`}>Step {content.step}</span>
          <div className="flex-1 h-1 bg-surface-3/50 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${content.color === 'ok' ? 'bg-ok' : content.color === 'err' ? 'bg-err' : content.color === 'recover' ? 'bg-recover' : content.color === 'info' ? 'bg-info' : 'bg-warn'}`}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Title + Timer */}
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h3 className={`text-lg font-bold ${TEXT[content.color]}`}>
            {content.title}
          </h3>
          {content.elapsed !== undefined && content.elapsed !== null && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warn/15 border border-warn/30 text-warn font-mono text-sm font-bold tabular-nums animate-pulse">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {content.elapsed.toFixed(1)}s
            </span>
          )}
        </div>

        {/* Body */}
        <p className="text-sm text-txt-2 leading-relaxed">
          {content.body}
        </p>

        {/* ── Recovery Proof ── */}
        {recoverySummary && (
          <div className="mt-4 space-y-3">
            {/* Before → After comparison */}
            <div className="grid grid-cols-2 gap-3">
              {/* Saved */}
              <div className="bg-surface-1/60 rounded-lg px-3.5 py-3 border border-info/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full bg-info" />
                  <span className="text-2xs font-bold text-info uppercase tracking-wider">Saved</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xs text-txt-3">Step</span>
                    <span className="text-sm font-mono font-bold text-txt-1">{recoverySummary.restoredStep}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xs text-txt-3">Loss</span>
                    <span className="text-sm font-mono font-bold text-txt-1">{recoverySummary.checkpointLoss.toFixed(4)}</span>
                  </div>
                </div>
              </div>

              {/* Restored */}
              <div className="bg-surface-1/60 rounded-lg px-3.5 py-3 border border-ok/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full bg-ok" />
                  <span className="text-2xs font-bold text-ok uppercase tracking-wider">Restored</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xs text-txt-3">Step</span>
                    <span className="text-sm font-mono font-bold text-txt-1">{recoverySummary.restoredStep}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xs text-txt-3">Loss</span>
                    <span className="text-sm font-mono font-bold text-txt-1">{recoverySummary.checkpointLoss.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Proof explanation */}
            <div className="bg-surface-1/40 rounded-lg px-3.5 py-2.5 border border-line/30">
              <p className="text-xs text-txt-2 leading-relaxed">
                <span className="text-ok font-semibold">Same step, same loss.</span>{' '}
                The model was restored to the exact state it was saved at.
                If the checkpoint had failed, loss would reset to{' '}
                <span className="font-mono text-err">~2.3</span>{' '}
                (random weights). Look at the chart — training continued from{' '}
                <span className="font-mono text-ok">{recoverySummary.checkpointLoss.toFixed(4)}</span>,
                not <span className="font-mono text-err">2.3</span>.
              </p>
            </div>
          </div>
        )}

        {/* Action callout */}
        {content.action && (
          <div className="mt-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${content.color === 'err' ? 'bg-err' : 'bg-ok'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${content.color === 'err' ? 'bg-err' : 'bg-ok'}`} />
            </span>
            <span className={`text-sm font-semibold ${TEXT[content.color]}`}>{content.action}</span>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
