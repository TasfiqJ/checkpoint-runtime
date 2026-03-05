import { useState, useEffect, useCallback } from 'react';

/**
 * Generic polling hook for fetching data from an API endpoint at a
 * fixed interval.  Returns the latest data, loading state, error, and
 * a manual refetch trigger.
 */
export function usePolling<T>(
  url: string,
  intervalMs: number = 5000,
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json: T = await res.json();
      setData(json);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, intervalMs);
    return () => clearInterval(id);
  }, [fetchData, intervalMs]);

  return { data, loading, error, refetch: fetchData };
}
