import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config/api';

// ── Parsed data types ────────────────────────────────────────────────────────

export interface LossPoint {
  step: number;
  loss: number;
  stepsPerSec: number;
}

export interface CheckpointMarker {
  step: number;
  loss: number;
  sizeBytes: number;
  sha256: string;
  saveTime: number;
}

export interface RecoveryMarker {
  checkpointId: string;
  step: number;
  sizeBytes: number;
  restoreTime: number;
}

// ── Regex patterns matching train.py log format ──────────────────────────────

const LOSS_RE = /step=(\d+)\/\d+\s+loss=([\d.]+)\s+steps\/s=([\d.]+)/;
const CKPT_RE = /Checkpoint saved \(runtime\): step=(\d+) loss=([\d.]+) size=(\d+) bytes sha256=(\S+) time=([\d.]+)s/;
const RESTORE_RE = /Restored from runtime checkpoint: checkpoint_id=(\S+) step=(\d+) size=(\d+) bytes time=([\d.]+)s/;

const MAX_LOSS = 500;
const MAX_CKPT = 50;
const MAX_RESTORE = 10;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLogParser(active: boolean) {
  const [lossHistory, setLossHistory] = useState<LossPoint[]>([]);
  const [checkpointMarkers, setCheckpointMarkers] = useState<CheckpointMarker[]>([]);
  const [recoveryMarkers, setRecoveryMarkers] = useState<RecoveryMarker[]>([]);
  const seenSteps = useRef(new Set<number>());

  useEffect(() => {
    if (!active) return;

    const containers = 'ckpt-worker-0,ckpt-worker-1';
    const es = new EventSource(`${API_BASE}/api/demo/logs?containers=${containers}&tail=30`);

    es.onmessage = (evt) => {
      try {
        const { line } = JSON.parse(evt.data) as { container: string; line: string };

        // Parse training step + loss
        const lm = LOSS_RE.exec(line);
        if (lm) {
          const step = parseInt(lm[1], 10);
          if (!seenSteps.current.has(step)) {
            seenSteps.current.add(step);
            setLossHistory(prev => [
              ...prev.slice(-(MAX_LOSS - 1)),
              { step, loss: parseFloat(lm[2]), stepsPerSec: parseFloat(lm[3]) },
            ]);
          }
        }

        // Parse checkpoint saved
        const cm = CKPT_RE.exec(line);
        if (cm) {
          setCheckpointMarkers(prev => [
            ...prev.slice(-(MAX_CKPT - 1)),
            {
              step: parseInt(cm[1], 10),
              loss: parseFloat(cm[2]),
              sizeBytes: parseInt(cm[3], 10),
              sha256: cm[4],
              saveTime: parseFloat(cm[5]),
            },
          ]);
        }

        // Parse recovery
        const rm = RESTORE_RE.exec(line);
        if (rm) {
          setRecoveryMarkers(prev => [
            ...prev.slice(-(MAX_RESTORE - 1)),
            {
              checkpointId: rm[1],
              step: parseInt(rm[2], 10),
              sizeBytes: parseInt(rm[3], 10),
              restoreTime: parseFloat(rm[4]),
            },
          ]);
        }
      } catch { /* skip malformed */ }
    };

    es.onerror = () => {};

    return () => es.close();
  }, [active]);

  return { lossHistory, checkpointMarkers, recoveryMarkers };
}
