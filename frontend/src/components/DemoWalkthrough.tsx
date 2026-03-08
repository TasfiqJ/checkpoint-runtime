import { motion, AnimatePresence } from 'framer-motion';
import type { RunState } from '../types';

// ── Step definitions ─────────────────────────────────────────────────────────

interface WalkthroughContent {
  step: string;
  title: string;
  body: string;
  action?: string;
  color: 'ok' | 'info' | 'err' | 'recover' | 'warn';
}

function getContent(
  walkthroughStep: number,
  runState: RunState,
  elapsed: number | null,
  recoverySummary: { detectTime: number; recoverTime: number; restoredStep: number; currentStep: number } | null,
): WalkthroughContent {

  // Recovery complete — show results
  if (recoverySummary) {
    return {
      step: 'Done',
      title: 'Recovery Complete — Zero Data Lost',
      body: `The system detected the crash in ${recoverySummary.detectTime.toFixed(1)}s, restarted the worker, loaded checkpoint from step ${recoverySummary.restoredStep}, and resumed training — all in ${recoverySummary.recoverTime.toFixed(1)}s total. The model continued from exactly where it left off. This is what production fault tolerance looks like.`,
      color: 'ok',
    };
  }

  // Kill/recovery cycle in progress — narrate based on run state
  if (walkthroughStep >= 3) {
    if (runState === 'FAILED') {
      return {
        step: '2/3',
        title: 'Crash Detected!',
        body: `The worker stopped sending heartbeats. The system noticed it's gone${elapsed !== null ? ` (${elapsed.toFixed(1)}s ago)` : ''}. Recovery is about to start — the system will restart the container and load the last saved checkpoint from storage.`,
        color: 'err',
      };
    }
    if (runState === 'RECOVERING') {
      return {
        step: '2/3',
        title: 'Recovering...',
        body: `The crashed worker is restarting. It's loading the last saved checkpoint from object storage right now${elapsed !== null ? ` (${elapsed.toFixed(1)}s since kill)` : ''}. When it finishes, training will resume from the exact step it was saved at — no work lost.`,
        color: 'recover',
      };
    }
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
  recoverySummary: { detectTime: number; recoverTime: number; restoredStep: number; currentStep: number } | null;
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

        {/* Title */}
        <h3 className={`text-lg font-bold mb-1 ${TEXT[content.color]}`}>
          {content.title}
        </h3>

        {/* Body */}
        <p className="text-sm text-txt-2 leading-relaxed">
          {content.body}
        </p>

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
