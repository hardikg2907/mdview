import { useEffect } from 'preact/hooks';
import type { WatchEvent } from '../../shared/types.js';

export function useSSE(onEvent: (e: WatchEvent) => void): void {
  useEffect(() => {
    const es = new EventSource('/api/watch');
    const handler = (msg: MessageEvent<string>) => {
      try {
        const data = JSON.parse(msg.data) as WatchEvent;
        onEvent(data);
      } catch { /* ignore malformed */ }
    };
    es.addEventListener('change', handler as EventListener);
    es.addEventListener('add', handler as EventListener);
    es.addEventListener('unlink', handler as EventListener);
    es.addEventListener('config', handler as EventListener);
    return () => es.close();
  }, [onEvent]);
}
