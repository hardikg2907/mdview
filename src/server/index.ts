import Fastify, { type FastifyInstance } from 'fastify';
import { registerApiFile } from './routes/api-file.js';
import { registerApiTree } from './routes/api-tree.js';
import { registerApiAsset } from './routes/api-asset.js';
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
  registerApiAsset(app, opts.rootAbsPath);
  registerSse(app, watcher);

  await app.register(import('@fastify/static'), {
    root: opts.clientDir,
    prefix: '/',
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/__asset/')) {
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
