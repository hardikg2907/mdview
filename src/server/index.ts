import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ProjectConfig, RootInfo, WatchEvent } from '../shared/types.js';
import { CONFIG_FILENAME, loadEffectiveConfig } from './config.js';
import { buildIgnoreSet } from './fs/ignore.js';
import { registerApiAsset } from './routes/api-asset.js';
import { registerApiFile } from './routes/api-file.js';
import { registerApiSearch } from './routes/api-search.js';
import { registerApiTree } from './routes/api-tree.js';
import { registerSse } from './routes/sse.js';
import { createWatcher } from './watcher.js';

export interface ServerOptions {
  rootAbsPath: string;
  rootInfo: RootInfo;
  clientDir: string;
}

export interface ConfigState {
  current: ProjectConfig | null;
  /** Frozen at startup — see comment on the configWatcher below. */
  ignoreSet: ReadonlySet<string>;
}

const CSP_HTML = [
  "default-src 'self'",
  "script-src 'self'",
  // KaTeX + mermaid inject inline styles into rendered output; the rest of
  // the policy is strict.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export async function createServer(opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Threat model: a user opens an untrusted .md file. markdown-it is configured
  // with html: true so raw <script> in source would otherwise execute and could
  // exfiltrate sibling files via /__asset/* and /api/file. The CSP below blocks
  // inline + remote scripts on the SPA shell, which is where rendered markdown
  // is injected.
  app.addHook('onSend', async (_req, reply, payload) => {
    const ct = String(reply.getHeader('content-type') ?? '');
    if (ct.startsWith('text/html')) {
      reply.header('content-security-policy', CSP_HTML);
      reply.header('x-content-type-options', 'nosniff');
      reply.header('referrer-policy', 'no-referrer');
    }
    return payload;
  });

  // Load config (global + project) before starting the watcher so the ignore
  // set is frozen in: chokidar caches `ignored` at construction time, and a
  // mid-flight change would leave the FSWatcher and the tree walker disagreeing
  // about which dirs to surface.
  const initialConfig = await loadEffectiveConfig(opts.rootAbsPath);
  const ignoreSet = buildIgnoreSet(initialConfig?.ignore ?? []);

  const configState: ConfigState = { current: initialConfig, ignoreSet };

  const watcher = createWatcher(opts.rootAbsPath, { ignore: ignoreSet });

  // Dedicated chokidar watch for .mdview.json — the main watcher ignores
  // dotfiles, so we'd never see it otherwise.
  const configPath = path.join(opts.rootAbsPath, CONFIG_FILENAME);
  const configWatcher: FSWatcher = chokidar.watch(configPath, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 60, pollInterval: 30 },
  });
  const reloadConfig = async (): Promise<void> => {
    // Note: only the scalar fields hot-reload. `ignore` is read once at startup
    // — changing it requires restarting mdview, because the FSWatcher was
    // constructed against the original set.
    configState.current = await loadEffectiveConfig(opts.rootAbsPath);
    const event: WatchEvent = { kind: 'config', relPath: CONFIG_FILENAME };
    watcher.emitSynthetic?.(event);
  };
  configWatcher.on('add', () => void reloadConfig());
  configWatcher.on('change', () => void reloadConfig());
  configWatcher.on('unlink', () => void reloadConfig());

  registerApiFile(app, opts.rootAbsPath, opts.rootInfo);
  registerApiTree(app, opts.rootAbsPath, opts.rootInfo, configState);
  registerApiAsset(app, opts.rootAbsPath);
  registerApiSearch(app, opts.rootAbsPath, opts.rootInfo, configState);
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

    // Parse pathname only — strip query string before extension check.
    const qIndex = req.url.indexOf('?');
    const rawPath = qIndex >= 0 ? req.url.slice(0, qIndex) : req.url;

    // Reject CR/LF in the URL to prevent header injection / response splitting
    // when we build the redirect Location header below.
    if (/[\r\n]/.test(rawPath)) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }

    // If a markdown-shaped path got here, something rendered a real <a href> to
    // it instead of intercepting client-side. Redirect into the SPA's ?file=
    // entrypoint so the right file loads instead of the SPA fallback picking a
    // random last-viewed file.
    if (/\.(md|markdown|mdx)$/i.test(rawPath)) {
      // Strip the leading slash; the file endpoint expects a root-relative path.
      const relPath = rawPath.replace(/^\/+/, '');
      // Same-origin redirect only: we control the path entirely; encodeURIComponent
      // prevents the user-controlled segment from breaking out of the query value
      // or smuggling CR/LF into the Location header.
      const location = `/?file=${encodeURIComponent(relPath)}`;
      reply.code(302).header('Location', location).send();
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
