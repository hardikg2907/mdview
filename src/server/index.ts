import Fastify, { type FastifyInstance } from 'fastify';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { registerApiFile } from './routes/api-file.js';
import { registerApiTree } from './routes/api-tree.js';
import { registerApiAsset } from './routes/api-asset.js';
import { registerApiSearch } from './routes/api-search.js';
import { registerSse } from './routes/sse.js';
import { createWatcher } from './watcher.js';
import { CONFIG_FILENAME, loadProjectConfig } from './config.js';
import type { ProjectConfig, RootInfo, WatchEvent } from '../shared/types.js';

export interface ServerOptions {
  rootAbsPath: string;
  rootInfo: RootInfo;
  clientDir: string;
}

export interface ConfigState {
  current: ProjectConfig | null;
}

export async function createServer(opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const watcher = createWatcher(opts.rootAbsPath);

  const configState: ConfigState = { current: await loadProjectConfig(opts.rootAbsPath) };

  // Dedicated chokidar watch for .mdview.json — the main watcher ignores
  // dotfiles, so we'd never see it otherwise.
  const configPath = path.join(opts.rootAbsPath, CONFIG_FILENAME);
  const configWatcher: FSWatcher = chokidar.watch(configPath, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 60, pollInterval: 30 },
  });
  const reloadConfig = async (): Promise<void> => {
    configState.current = await loadProjectConfig(opts.rootAbsPath);
    const event: WatchEvent = { kind: 'config', relPath: CONFIG_FILENAME };
    watcher.emitSynthetic?.(event);
  };
  configWatcher.on('add', () => void reloadConfig());
  configWatcher.on('change', () => void reloadConfig());
  configWatcher.on('unlink', () => void reloadConfig());

  registerApiFile(app, opts.rootAbsPath, opts.rootInfo);
  registerApiTree(app, opts.rootAbsPath, opts.rootInfo, configState);
  registerApiAsset(app, opts.rootAbsPath);
  registerApiSearch(app, opts.rootAbsPath, opts.rootInfo);
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
    await configWatcher.close();
  });

  return app;
}
