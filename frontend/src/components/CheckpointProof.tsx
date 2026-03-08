import { motion, AnimatePresence } from 'framer-motion';
import type { CheckpointMarker } from '../hooks/useLogParser';
import { formatBytes } from '../design';

interface Props {
  checkpointMarkers: CheckpointMarker[];
}

export default function CheckpointProof({ checkpointMarkers }: Props) {
  const latest = checkpointMarkers.length > 0 ? checkpointMarkers[checkpointMarkers.length - 1] : null;

  return (
    <div className="card overflow-hidden">
      <div className="panel-header">
        <span className="panel-tag">proof</span>
        <h4 className="panel-title">Latest Checkpoint</h4>
      </div>

      {!latest ? (
        <div className="px-3.5 py-4">
          <p className="text-xs text-txt-3 text-center">No checkpoints yet...</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${latest.step}-${latest.sha256}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="px-3.5 py-3 space-y-2.5"
          >
            {/* Key metrics grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-txt-3">Step</span>
                <span className="font-mono font-semibold text-txt-1">{latest.step}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-3">Loss</span>
                <span className="font-mono font-semibold text-ok">{latest.loss.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-3">Size</span>
                <span className="font-mono text-txt-2">{formatBytes(latest.sizeBytes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-3">Save time</span>
                <span className="font-mono text-txt-2">{latest.saveTime.toFixed(2)}s</span>
              </div>
            </div>

            {/* SHA-256 hash */}
            <div className="bg-surface-2 rounded-md px-2.5 py-1.5">
              <p className="text-2xs text-txt-3 mb-0.5">SHA-256</p>
              <p className="font-mono text-2xs text-txt-2 break-all">{latest.sha256}</p>
            </div>

            {/* Explanation */}
            <p className="text-2xs text-txt-3 leading-relaxed">
              Contains 202K model parameters serialized as PyTorch tensors. The SHA-256 hash proves
              data integrity — if even one bit changed, the hash would be completely different.
            </p>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
