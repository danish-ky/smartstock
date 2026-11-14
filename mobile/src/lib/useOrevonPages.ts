import { useEffect, useMemo, useRef, useState } from 'react';

export type PagePayload<T> = T[] | { results?: T[]; next?: string | null };

function nextPath<T>(payload: PagePayload<T> | null | undefined, path: string): string | null {
  if (!payload || Array.isArray(payload) || !payload.next) return null;
  const mark = payload.next.indexOf('?');
  if (mark === -1) return null;
  const query = payload.next.slice(mark + 1).split('#')[0];
  // Never follow a server-provided URL or arbitrary path: use our existing authenticated API origin.
  if (!query || query.length > 4000 || !/^[a-zA-Z0-9_%.=&+~,:/-]+$/.test(query)) return null;
  return `${path}?${query}`;
}

export function useOrevonPages<T extends { id: number }>(
  first: PagePayload<T> | null | undefined,
  path: string,
  fetchPage: (path: string) => Promise<PagePayload<T>>,
) {
  const [extra, setExtra] = useState<T[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    setExtra([]);
    setNext(nextPath(first, path));
    setBusy(false);
    setError('');
  }, [first, path]);

  const rows = useMemo(() => {
    const items = Array.isArray(first) ? first : (first?.results ?? []);
    const ids = new Set(items.map(item => item.id));
    return [...items, ...extra.filter(item => !ids.has(item.id))];
  }, [first, extra]);

  async function loadMore() {
    if (!next || inFlight.current) return;
    const current = generation.current;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const page = await fetchPage(next);
      if (current !== generation.current) return;
      const additions = Array.isArray(page) ? page : (page.results ?? []);
      setExtra(old => {
        const known = new Set([...((Array.isArray(first) ? first : first?.results) ?? []), ...old].map(item => item.id));
        return [...old, ...additions.filter(item => !known.has(item.id))];
      });
      setNext(nextPath(page, path));
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Could not load more records.');
    } finally {
      if (current === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return { rows, moreAvailable: Boolean(next), loadingMore: busy, moreError: error, loadMore };
}
