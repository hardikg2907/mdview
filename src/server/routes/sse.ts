import type { FastifyInstance } from 'fastify';
import type { WatchEvent } from '../../shared/types.js';
import type { Watcher } from '../watcher.js';

export interface SseHooks {
  /** Called when a client connects and when one goes away, with the new count. */
  onClientsChanged?: (count: number) => void;
}

/**
 * One stream carries every root's events, via the hub the roots forward into —
 * so a root opened after a client connected still reaches it.
 */
export function registerSse(app: FastifyInstance, hub: Watcher, hooks: SseHooks = {}): void {
  let clients = 0;
  app.get('/api/watch', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    let closed = false;
    clients++;
    hooks.onClientsChanged?.(clients);

    // A suspended tab / dropped network can leave the OS-side socket in a state
    // where 'close' doesn't fire promptly, so each write becomes the actual
    // disconnect signal. Treat any write failure as a hard disconnect and run
    // cleanup, otherwise stale listeners pile up on the watcher emitter and
    // every subsequent file save fans out into a dead pipe.
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      hub.off('event', send);
      clients--;
      hooks.onClientsChanged?.(clients);
      try { reply.raw.end(); } catch { /* already closed */ }
    };

    const send = (e: WatchEvent) => {
      if (closed) return;
      try {
        reply.raw.write(`event: ${e.kind}\n`);
        reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
      } catch {
        cleanup();
      }
    };

    const heartbeat = setInterval(() => {
      if (closed) return;
      try {
        reply.raw.write(': hb\n\n');
      } catch {
        cleanup();
      }
    }, 15_000);

    hub.on('event', send);

    req.raw.on('close', cleanup);
    req.raw.on('error', cleanup);
    reply.raw.on('error', cleanup);
    reply.raw.on('close', cleanup);
  });
}
