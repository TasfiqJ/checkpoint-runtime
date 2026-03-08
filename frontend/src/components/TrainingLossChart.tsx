import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot,
} from 'recharts';
import type { LossPoint, CheckpointMarker, RecoveryMarker } from '../hooks/useLogParser';

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface TipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: LossPoint }>;
}

function LossTooltip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-surface-3 border border-line-emphasis rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-txt-3 mb-1">Step {d.step}</p>
      <p className="font-mono text-ok">loss: {d.loss.toFixed(4)}</p>
      <p className="font-mono text-txt-3">{d.stepsPerSec.toFixed(1)} steps/s</p>
    </div>
  );
}

// ── Main chart ───────────────────────────────────────────────────────────────

interface Props {
  lossHistory: LossPoint[];
  checkpointMarkers: CheckpointMarker[];
  recoveryMarkers: RecoveryMarker[];
  killStep: number | null;
}

export default function TrainingLossChart({
  lossHistory, checkpointMarkers, recoveryMarkers, killStep,
}: Props) {
  if (lossHistory.length === 0) {
    return (
      <div className="card p-5">
        <div className="panel-header mb-0">
          <span className="panel-tag">loss</span>
          <h4 className="panel-title">Training Loss</h4>
        </div>
        <p className="text-sm text-txt-3 mt-3 text-center py-6">Waiting for training data...</p>
      </div>
    );
  }

  // Find loss values at checkpoint/recovery steps for ReferenceDots
  const findLoss = (step: number) => {
    // Find closest loss point
    let closest = lossHistory[0];
    for (const p of lossHistory) {
      if (Math.abs(p.step - step) < Math.abs(closest.step - step)) closest = p;
    }
    return closest?.loss ?? null;
  };

  return (
    <div className="card p-5">
      <div className="panel-header">
        <span className="panel-tag">loss</span>
        <h4 className="panel-title">Training Loss</h4>
      </div>
      <p className="text-xs text-txt-3 mt-1 mb-3">
        Synthetic workload — loss shows training is progressing. Dots mark checkpoints and events.
      </p>

      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lossHistory} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line-subtle, #333)" />
            <XAxis
              dataKey="step"
              tick={{ fill: 'var(--color-txt-3, #888)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--color-txt-3, #888)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={['auto', 'auto']}
              width={40}
            />
            <Tooltip content={<LossTooltip />} />
            <Line
              type="monotone"
              dataKey="loss"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#10b981' }}
              isAnimationActive={false}
            />

            {/* Checkpoint markers (blue dots) */}
            {checkpointMarkers.map((cp) => {
              const loss = findLoss(cp.step);
              if (loss === null) return null;
              return (
                <ReferenceDot
                  key={`cp-${cp.step}`}
                  x={cp.step}
                  y={loss}
                  r={5}
                  fill="#3b82f6"
                  stroke="#1e3a5f"
                  strokeWidth={1}
                />
              );
            })}

            {/* Kill marker (red) */}
            {killStep !== null && (() => {
              const loss = findLoss(killStep);
              if (loss === null) return null;
              return (
                <ReferenceDot
                  x={killStep}
                  y={loss}
                  r={7}
                  fill="#ef4444"
                  stroke="#7f1d1d"
                  strokeWidth={2}
                />
              );
            })()}

            {/* Recovery markers (purple) */}
            {recoveryMarkers.map((rm) => {
              const loss = findLoss(rm.step);
              if (loss === null) return null;
              return (
                <ReferenceDot
                  key={`rm-${rm.step}`}
                  x={rm.step}
                  y={loss}
                  r={6}
                  fill="#8b5cf6"
                  stroke="#4c1d95"
                  strokeWidth={1}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-txt-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#10b981]" /> Loss
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#3b82f6]" /> Checkpoint
        </span>
        {killStep !== null && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Kill
          </span>
        )}
        {recoveryMarkers.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#8b5cf6]" /> Recovery
          </span>
        )}
      </div>
    </div>
  );
}
