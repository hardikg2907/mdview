import Fastify, { type FastifyInstance } from 'fastify';
import { registerApiFile } from './routes/api-file.js';
import { registerApiTree } from './routes/api-tree.js';
import { registerSse } from './routes/sse.js';
import { createWatcher } from './watcher.js';
import type { RootInfo } from '../shared/types.js';

export interface ServerOptions {
  rootAbsPath: string;
  rootInfo: RootInfo;
  clientDir: string;
  port: number;
}

export async function createServer(opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const watcher = createWatcher(opts.rootAbsPath);

  registerApiFile(app, opts.rootAbsPath, opts.rootInfo);
  registerApiTree(app, opts.rootAbsPath, opts.rootInfo);
  registerSse(app, watcher);

  await app.register(import('@fastify/static'), {
    root: opts.clientDir,
    prefix: '/',
    decorateReply: false,
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }
    return reply.sendFile('index.html');
  });

  app.addHook('onClose', async () => {
    await watcher.close();
  });

  return app;
}
