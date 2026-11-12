import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { parseFrontmatter } from '../../render/frontmatter.js';
import { rewriteLinksAndImages } from '../../render/links.js';
import { renderMarkdown } from '../../render/markdown.js';
import { extractOutline } from '../../render/outline.js';
import {
  DEFAULT_PALETTE,
  PALETTES,
  type Palette,
  type RenderedFile,
} from '../../shared/types.js';
import { MAX_MARKDOWN_BYTES, OutsideRootError, resolveSafePath } from '../fs/resolve.js';
import { parseWorkspacePath, type RootState, toWorkspacePath } from '../workspace.js';

const MD_FILE_RE = /\.(md|markdown|mdx)$/i;

/** Every `/__asset/<path>` URL in rendered HTML, up to the end of the attribute value. */
const ASSET_URL_RE = /\/__asset\/([^"'<>\s]*)/g;

const ENTITY: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

interface CachedRenderEntry {
  absPath: string;
  mtimeMs: number;
  size: number;
  json: string;
  assetRefs?: ReadonlySet<string>;
}

/**
 * Bounded LRU cache of pre-serialized RenderedFile JSON responses, keyed by
 * `${wsRel}\0${palette}` and verified against `(absPath, mtimeMs, size)` after
 * `resolveSafePath` + `stat`. Watcher events also invalidate matching entries
 * to close the gap of sub-tick edits.
 */
export class RenderedFileCache {
  private readonly entries = new Map<string, CachedRenderEntry>();
  private readonly maxChars: number;
  private chars = 0;

  constructor(maxChars = 16 * 1024 * 1024) {
    this.maxChars = maxChars;
  }

  private static makeKey(wsRel: string, palette: Palette): string {
    return `${wsRel}\0${palette}`;
  }

  get(
    wsRel: string,
    palette: Palette,
    absPath: string,
    mtimeMs: number,
    size: number,
  ): CachedRenderEntry | undefined {
    const key = RenderedFileCache.makeKey(wsRel, palette);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.absPath !== absPath || entry.mtimeMs !== mtimeMs || entry.size !== size) {
      this.deleteKey(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(wsRel: string, palette: Palette, entry: CachedRenderEntry): void {
    const key = RenderedFileCache.makeKey(wsRel, palette);
    this.deleteKey(key);
    const cost = key.length + entry.json.length;
    if (cost > this.maxChars / 4) return;
    this.entries.set(key, entry);
    this.chars += cost;
    for (const [oldest] of this.entries) {
      if (this.chars <= this.maxChars) break;
      this.deleteKey(oldest);
    }
  }

  /** Drop entries matching either the workspace-scoped path or a changed on-disk path. */
  invalidate(wsRel: string, absCandidate?: string): void {
    const prefix = `${wsRel}\0`;
    for (const [key, entry] of this.entries) {
      if (
        key.startsWith(prefix) ||
        (absCandidate !== undefined && entry.absPath === absCandidate)
      ) {
        this.deleteKey(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
    this.chars = 0;
  }

  private deleteKey(key: string): void {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.chars -= key.length + existing.json.length;
    this.entries.delete(key);
  }
}

export interface ApiFileOptions {
  cache?: RenderedFileCache;
}

/** The form a referenced path and a requested one are compared in. */
export function assetRefKey(rel: string): string {
  return path.posix.normalize(rel.replace(/^\/+/, ''));
}

/**
 * The within-root paths `html` references through `/__asset/`, for `state`.
 *
 * Mirrors what the browser will ask for: the attribute is HTML-unescaped, the
 * query and fragment never reach the route, and the route parameter arrives
 * percent-decoded. A reference this misreads only makes its asset 404.
 */
function collectAssetRefs(html: string, roots: readonly RootState[], state: RootState): Set<string> {
  const refs = new Set<string>();
  for (const m of html.matchAll(ASSET_URL_RE)) {
    const raw = (m[1] ?? '').replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITY[e] ?? e);
    const bare = raw.split(/[?#]/, 1)[0] ?? '';
    let decoded: string;
    try {
      decoded = decodeURIComponent(bare);
    } catch {
      continue;
    }
    const target = parseWorkspacePath(roots, decoded);
    if (target?.state === state) refs.add(assetRefKey(target.rel));
  }
  return refs;
}

interface Rendered {
  html: string;
  outline: RenderedFile['outline'];
  frontmatter: RenderedFile['frontmatter'];
  title: string | null;
}

async function renderDocument(raw: string, wsRel: string, palette: Palette): Promise<Rendered> {
  const { data, body, bodyStartLine } = parseFrontmatter(raw);
  const { html: rawHtml, tokens } = await renderMarkdown(body, bodyStartLine, palette);
  // Link and image rewriting run in one linear pass against the workspace-scoped
  // path, so relative targets resolve within the same root and the ?file= and
  // /__asset/ URLs they emit come out already root-qualified.
  const html = rewriteLinksAndImages(rawHtml, wsRel);
  const outline = extractOutline(tokens);
  const title =
    (typeof data?.title === 'string' ? data.title : null) ?? outline[0]?.text ?? null;
  return { html, outline, frontmatter: data, title };
}

/**
 * The assets a single-file root may serve. Normally recorded by the last
 * /api/file render; rendered here when there is none yet, as after a restart
 * with a tab still open. A document that can't be read references nothing.
 */
export async function documentAssetRefs(
  roots: readonly RootState[],
  state: RootState,
): Promise<ReadonlySet<string>> {
  if (state.assetRefs) return state.assetRefs;
  let refs = new Set<string>();
  try {
    const absPath = await resolveSafePath(state.absPath, state.root.filePath, {
      ...(state.realRoot ? { realRoot: state.realRoot } : {}),
    });
    const st = await stat(absPath);
    if (st.isFile() && st.size <= MAX_MARKDOWN_BYTES && MD_FILE_RE.test(absPath)) {
      const raw = await readFile(absPath, 'utf8');
      const wsRel = toWorkspacePath(state.root.id, state.root.filePath);
      const { html } = await renderDocument(raw, wsRel, DEFAULT_PALETTE);
      refs = collectAssetRefs(html, roots, state);
    }
  } catch {
    // Unreadable or gone: nothing is referenced.
  }
  state.assetRefs = refs;
  return refs;
}

export function registerApiFile(
  app: FastifyInstance,
  roots: readonly RootState[],
  opts: ApiFileOptions = {},
): void {
  const cache = opts.cache ?? new RenderedFileCache();
  app.get<{ Querystring: { path?: unknown; palette?: unknown } }>(
    '/api/file',
    async (req, reply) => {
      if (req.query.path !== undefined && typeof req.query.path !== 'string') {
        return reply.code(400).send({ error: 'Invalid ?path' });
      }
      const requested = req.query.path?.trim() ?? '';
      // Untrusted query value: checked against the allow-list, never used to
      // build a key or a path. An unknown palette renders the default rather
      // than failing the request — the document is what was asked for, and the
      // colours are recoverable by picking a palette again.
      const rawPalette = typeof req.query.palette === 'string' ? req.query.palette.trim() : '';
      const palette: Palette = (PALETTES as readonly string[]).includes(rawPalette)
        ? (rawPalette as Palette)
        : DEFAULT_PALETTE;
      const primary = roots[0];
      if (!primary) {
        return reply.code(404).send({ error: 'No folders are open' });
      }

      let wsPath = requested;
      if (!wsPath) {
        // A single-file root pins the view to its one file, so ?path is optional
        // there. A folder root has nothing to guess at.
        if (primary.root.kind !== 'file') {
          return reply.code(400).send({ error: 'Missing ?path' });
        }
        wsPath = toWorkspacePath(primary.root.id, primary.root.filePath);
      }

      const resolved = parseWorkspacePath(roots, wsPath);
      if (!resolved) {
        return reply.code(404).send({ error: 'File not found' });
      }
      const { state, rel } = resolved;
      const pinned = state.root.kind === 'file';

      if (pinned && rel !== state.root.filePath) {
        return reply.code(404).send({ error: 'File not found in single-file mode' });
      }

      // Restrict to markdown extensions. Without this, /api/file?path=.env
      // returns the file's contents inside the rendered response, since the
      // route otherwise reads any file under root.
      if (!MD_FILE_RE.test(rel)) {
        return reply.code(400).send({ error: 'Only markdown files are supported' });
      }

      let absPath: string;
      let realRoot: string;
      try {
        realRoot = state.realRoot ?? (await realpath(state.absPath));
        absPath = await resolveSafePath(state.absPath, rel, { realRoot });
      } catch (err) {
        if (err instanceof OutsideRootError) {
          return reply.code(400).send({ error: err.message });
        }
        return reply.code(404).send({ error: 'File not found' });
      }
      // An in-root link named `notes.md` may point at `.env`; the file read is
      // the link's target, so the target has to be markdown too.
      if (!MD_FILE_RE.test(absPath)) {
        return reply.code(400).send({ error: 'Only markdown files are supported' });
      }

      let st: Awaited<ReturnType<typeof stat>>;
      try {
        st = await stat(absPath);
      } catch {
        return reply.code(404).send({ error: 'File not found' });
      }
      if (!st.isFile()) {
        return reply.code(404).send({ error: 'File not found' });
      }
      if (st.size > MAX_MARKDOWN_BYTES) {
        return reply.code(413).send({ error: 'File is too large to render (over 16 MB)' });
      }

      const wsRel = toWorkspacePath(state.root.id, rel);
      const cached = cache.get(wsRel, palette, absPath, st.mtimeMs, st.size);
      if (cached) {
        if (pinned && !state.assetRefs && cached.assetRefs) {
          state.assetRefs = cached.assetRefs;
        }
        return reply.type('application/json; charset=utf-8').send(cached.json);
      }

      let raw: string;
      try {
        raw = await readFile(absPath, 'utf8');
      } catch {
        return reply.code(404).send({ error: 'File not found' });
      }

      const { html, outline, frontmatter, title } = await renderDocument(raw, wsRel, palette);
      let assetRefs: ReadonlySet<string> | undefined;
      if (pinned) {
        assetRefs = collectAssetRefs(html, roots, state);
        state.assetRefs = assetRefs;
      }

      const result: RenderedFile = {
        relPath: wsRel,
        html,
        outline,
        frontmatter,
        title,
        lastModified: st.mtimeMs,
      };
      const json = JSON.stringify(result);
      cache.set(wsRel, palette, {
        absPath,
        mtimeMs: st.mtimeMs,
        size: st.size,
        json,
        ...(assetRefs ? { assetRefs } : {}),
      });
      return reply.type('application/json; charset=utf-8').send(json);
    },
  );
}
