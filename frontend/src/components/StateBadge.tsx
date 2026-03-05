import type { RunState, CheckpointState } from '../types';

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

const CKPT_STATE_STYLES: Record<CheckpointState, string> = {
  PENDING:     'bg-gray-700/50 text-gray-300',
  IN_PROGRESS: 'bg-yellow-900/50 text-yellow-400',
  COMMITTED:   'bg-green-900/50 text-green-400',
  FAILED:      'bg-red-900/50 text-red-400',
};

export function StateBadge({ state, large }: { state: RunState; large?: boolean }) {
  const size = large ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${size} ${STATE_STYLES[state] ?? 'bg-gray-700/50 text-gray-300'}`}>
      {state}
    </span>
  );
}

export function CheckpointBadge({ state }: { state: CheckpointState }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CKPT_STATE_STYLES[state] ?? 'bg-gray-700/50 text-gray-300'}`}>
      {state}
    </span>
  );
}
