import type { FastifyInstance } from 'fastify';
import type { Watcher } from '../watcher.js';
import type { WatchEvent } from '../../shared/types.js';

export function registerSse(app: FastifyInstance, watcher: Watcher): void {
  app.get('/api/watch', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const send = (e: WatchEvent) => {
      reply.raw.write(`event: ${e.kind}\n`);
      reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    watcher.on('event', send);

    const heartbeat = setInterval(() => reply.raw.write(': hb\n\n'), 15_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      watcher.off('event', send);
      try { reply.raw.end(); } catch { /* already closed */ }
    });
  });
}
