import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Palette, WatchEvent } from '../shared/types.js';
import { CONFIG_FILENAME, loadEffectiveConfig } from './config.js';
import { buildIgnoreSet } from './fs/ignore.js';
import { isAllowedHost } from './hosts.js';
import { registerApiAsset } from './routes/api-asset.js';
import { registerApiFile } from './routes/api-file.js';
import { registerApiSearch } from './routes/api-search.js';
import { registerApiTree } from './routes/api-tree.js';
import { registerHealth } from './routes/health.js';
import { registerSse } from './routes/sse.js';
import { createEventHub, createWatcher } from './watcher.js';
import { describeRoot, type RootSpec, type RootState, resolveRootId } from './workspace.js';

export interface ServerOptions {
  /**
   * The folders to serve, in display order. The first is the primary root: its
   * `.mdview.json` supplies the window-level settings, and an unprefixed path
   * resolves against it.
   */
  roots: RootSpec[];
  clientDir: string;
  /**
   * Optional CLI override for the palette. Wins over both the project
   * `.mdview.json` and the global config, but is applied at API-response
   * time so `.mdview.json` on disk is never modified.
   */
  paletteOverride?: Palette;
  /**
   * When true, the server is running inside a VS Code webview iframe (spawned
   * via --vscode). Omits frame-ancestors entirely — see the comment at the CSP
   * assembly site below for the full security argument.
   */
  embedMode?: boolean;
  /** Reported by /api/health so the CLI can tell our daemon from a stranger. */
  identity?: { pid: number; startedAt: number };
  /** Called whenever the number of connected SSE clients changes. */
  onSseClientsChanged?: (count: number) => void;
}

export interface MdviewServer {
  app: FastifyInstance;
  /**
   * Replace the open root set: opens what's new, closes what's gone, reorders
   * to match, and tells connected clients to refetch. Order matters — the first
   * root is the primary one.
   */
  setRoots(specs: RootSpec[]): Promise<void>;
}

// Why: under --vscode the page is loaded inside a VS Code webview iframe whose
// parent uses the non-network `vscode-webview:` origin scheme. Chromium 142
// (shipped in VS Code 1.126) narrowed `frame-ancestors *` to match only network
// schemes (http/https/ws/wss), so no frame-ancestors value short of naming the
// dynamic `vscode-webview://<uuid>` origin will permit the webview to frame us.
// We therefore OMIT the directive entirely in embed mode — framing is
// intentionally unrestricted there. The loopback bind (127.0.0.1) is the real
// network boundary; frame-ancestors is only defense-in-depth, and the
// relaxation is gated by the explicit --vscode flag (default browser users keep
// `frame-ancestors 'none'`). Deliberate, audited exception to CLAUDE.md §3.1.
// See docs/superpowers/specs/2026-05-24-vscode-extension-design.md §18.1.
function buildCspHtml(embedMode: boolean): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    // KaTeX + mermaid inject inline styles into rendered output; the rest of
    // the policy is strict.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ];
  if (!embedMode) directives.push("frame-ancestors 'none'");
  return directives.join('; ');
}

export async function createServer(opts: ServerOptions): Promise<MdviewServer> {
  const app = Fastify({ logger: false });
  const cspHtml = buildCspHtml(opts.embedMode ?? false);

  // Rejected before routing, so it covers the API, /__asset/*, the SSE stream
  // and the SPA shell alike. See src/server/hosts.ts for why the hostname is
  // the whole check and the port is not part of it.
  app.addHook('onRequest', async (req, reply) => {
    if (isAllowedHost(req.headers.host)) return;
    return reply.code(403).type('text/plain; charset=utf-8').send('Forbidden');
  });

  // Threat model: a user opens an untrusted .md file. markdown-it is configured
  // with html: true so raw <script> in source would otherwise execute and could
  // exfiltrate sibling files via /__asset/* and /api/file. The CSP below blocks
  // inline + remote scripts on the SPA shell, which is where rendered markdown
  // is injected.
  app.addHook('onSend', async (_req, reply, payload) => {
    const ct = String(reply.getHeader('content-type') ?? '');
    if (ct.startsWith('text/html')) {
      reply.header('content-security-policy', cspHtml);
      reply.header('x-content-type-options', 'nosniff');
      reply.header('referrer-policy', 'no-referrer');
    }
    return payload;
  });

  // Load config (global + project) before starting each watcher so the ignore
  // set is frozen in: chokidar caches `ignored` at construction time, and a
  // mid-flight change would leave the FSWatcher and the tree walker disagreeing
  // about which dirs to surface.
  //
  // `roots` is mutated in place rather than replaced, so the route closures
  // always see the current set.
  const roots: RootState[] = [];
  const configWatchers = new Map<string, FSWatcher>();
  const hub = createEventHub();

  async function openRoot(spec: RootSpec, id: string): Promise<RootState> {
    const config = await loadEffectiveConfig(spec.absPath);
    const ignoreSet = buildIgnoreSet(config?.ignore ?? []);
    const state: RootState = {
      root: describeRoot(spec, id),
      absPath: spec.absPath,
      ignoreSet,
      config,
      watcher: createWatcher(spec.absPath, { ignore: ignoreSet, prefix: id }),
    };
    state.watcher.on('event', (e) => hub.emitSynthetic(e));

    // Dedicated chokidar watch for .mdview.json — the main watcher ignores
    // dotfiles, so we'd never see it otherwise. One per root, because each root
    // carries its own config file.
    const configWatcher: FSWatcher = chokidar.watch(path.join(spec.absPath, CONFIG_FILENAME), {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 60, pollInterval: 30 },
    });
    const reloadConfig = async (): Promise<void> => {
      // Note: only the scalar fields hot-reload. `ignore` is read once at
      // startup — changing it requires reopening the root, because the
      // FSWatcher was constructed against the original set.
      state.config = await loadEffectiveConfig(spec.absPath);
      const event: WatchEvent = { kind: 'config', relPath: `${id}/${CONFIG_FILENAME}` };
      hub.emitSynthetic(event);
    };
    configWatcher.on('add', () => void reloadConfig());
    configWatcher.on('change', () => void reloadConfig());
    configWatcher.on('unlink', () => void reloadConfig());
    configWatchers.set(id, configWatcher);

    return state;
  }

  async function closeRoot(state: RootState): Promise<void> {
    const cw = configWatchers.get(state.root.id);
    configWatchers.delete(state.root.id);
    await Promise.all([state.watcher.close(), cw?.close()]);
  }

  async function setRoots(specs: RootSpec[]): Promise<void> {
    const taken = new Set<string>();
    const wanted = specs.map((spec) => {
      const id = resolveRootId(spec, taken);
      taken.add(id);
      return { id, spec };
    });

    // A root whose path changed under the same id has to be reopened, not
    // reused — its watcher and ignore set belong to the old directory.
    const keep = new Map(
      roots
        .filter((r) => wanted.some((w) => w.id === r.root.id && w.spec.absPath === r.absPath))
        .map((r) => [r.root.id, r]),
    );
    const dropped = roots.filter((r) => !keep.has(r.root.id));

    const next: RootState[] = [];
    for (const { id, spec } of wanted) {
      const existing = keep.get(id);
      next.push(existing ?? (await openRoot(spec, id)));
    }

    roots.length = 0;
    roots.push(...next);
    await Promise.all(dropped.map(closeRoot));
    hub.emitSynthetic({ kind: 'workspace' });
  }

  {
    const taken = new Set<string>();
    for (const spec of opts.roots) {
      const id = resolveRootId(spec, taken);
      taken.add(id);
      roots.push(await openRoot(spec, id));
    }
  }

  registerApiFile(app, roots);
  registerApiTree(app, roots, opts.paletteOverride);
  registerApiAsset(app, roots);
  registerApiSearch(app, roots);
  registerSse(app, hub, { ...(opts.onSseClientsChanged ? { onClientsChanged: opts.onSseClientsChanged } : {}) });
  if (opts.identity) registerHealth(app, opts.identity, roots);

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
    await Promise.all([
      ...roots.map((r) => r.watcher.close()),
      ...[...configWatchers.values()].map((w) => w.close()),
    ]);
    await hub.close();
  });

  return { app, setRoots };
}
