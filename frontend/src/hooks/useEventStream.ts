import { useState, useEffect } from 'react';
import type { RunEvent } from '../types';

const MAX_EVENTS = 200;

/**
 * Hook that subscribes to a Server-Sent Events stream for run lifecycle
 * events.  Returns the accumulated event list (capped at MAX_EVENTS)
 * and automatically reconnects on failures.
 */
export function useEventStream(runId: string | undefined): RunEvent[] {
  const [events, setEvents] = useState<RunEvent[]>([]);

  useEffect(() => {
    if (!runId) return;

    const es = new EventSource(`/api/runs/${runId}/events`);

    const pushEvent = (type: string, data: string) => {
      const event: RunEvent = {
        type,
        data,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev.slice(-(MAX_EVENTS - 1)), event]);
    };

    es.onmessage = (evt) => pushEvent('message', evt.data);
    es.addEventListener('state_change', (evt) => pushEvent('state_change', (evt as MessageEvent).data));
    es.addEventListener('checkpoint', (evt) => pushEvent('checkpoint', (evt as MessageEvent).data));
    es.addEventListener('error_event', (evt) => pushEvent('error', (evt as MessageEvent).data));

    // EventSource auto-reconnects on error
    es.onerror = () => {};

    return () => es.close();
  }, [runId]);

  return events;
}
