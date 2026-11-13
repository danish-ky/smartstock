import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function useRemote<T>(path: string) {
  const { apiGet } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await apiGet<T>(path);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load data.');
    } finally {
      setBusy(false);
    }
  }, [apiGet, path]);

  useEffect(() => { void reload(); }, [reload]);
  return { data, busy, error, reload };
}
