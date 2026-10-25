import { useEffect, useRef } from 'preact/hooks';
import type { WatchEvent } from '../../shared/types.js';
import { withEmbedToken } from '../lib/embed.js';

export function useSSE(onEvent: (e: WatchEvent) => void): void {
  // Handlers are rebuilt on every navigation. Reading the newest one through a
  // ref keeps a single EventSource for the hook's lifetime, so no event can fall
  // into a close/reopen gap and the server's client count never dips to zero.
  const latest = useRef(onEvent);
  latest.current = onEvent;

  useEffect(() => {
    const es = new EventSource(withEmbedToken('/api/watch'));
    const handler = (msg: MessageEvent<string>) => {
      try {
        const data = JSON.parse(msg.data) as WatchEvent;
        latest.current(data);
      } catch { /* ignore malformed */ }
    };
    es.addEventListener('change', handler as EventListener);
    es.addEventListener('add', handler as EventListener);
    es.addEventListener('unlink', handler as EventListener);
    es.addEventListener('config', handler as EventListener);
    es.addEventListener('workspace', handler as EventListener);
    return () => es.close();
  }, []);
}
