import { readFile, stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { parseFrontmatter } from '../../render/frontmatter.js';
import { rewriteImageSrc, tagInternalLinks } from '../../render/links.js';
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

export function registerApiFile(app: FastifyInstance, roots: readonly RootState[]): void {
  app.get<{ Querystring: { path?: string; palette?: string } }>(
    '/api/file',
    async (req, reply) => {
    const requested = req.query.path?.trim() ?? '';
    // Untrusted query value: checked against the allow-list, never used to
    // build a key or a path. An unknown palette renders the default rather
    // than failing the request — the document is what was asked for, and the
    // colours are recoverable by picking a palette again.
    const rawPalette = req.query.palette?.trim() ?? '';
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

    if (state.root.kind === 'file' && rel !== state.root.filePath) {
      return reply.code(404).send({ error: 'File not found in single-file mode' });
    }

    // Restrict to markdown extensions. Without this, /api/file?path=.env
    // returns the file's contents inside the rendered response, since the
    // route otherwise reads any file under root.
    if (!MD_FILE_RE.test(rel)) {
      return reply.code(400).send({ error: 'Only markdown files are supported' });
    }

    let absPath: string;
    try {
      absPath = await resolveSafePath(state.absPath, rel);
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

    let raw: string;
    let mtimeMs: number;
    try {
      const st = await stat(absPath);
      if (!st.isFile()) {
        return reply.code(404).send({ error: 'File not found' });
      }
      if (st.size > MAX_MARKDOWN_BYTES) {
        return reply.code(413).send({ error: 'File is too large to render (over 16 MB)' });
      }
      raw = await readFile(absPath, 'utf8');
      mtimeMs = st.mtimeMs;
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }

    const { data, body, bodyStartLine } = parseFrontmatter(raw);
    const { html: rawHtml, tokens } = await renderMarkdown(body, bodyStartLine, palette);
    // Link and image rewriting run against the workspace-scoped path, so
    // relative targets resolve within the same root and the ?file= and
    // /__asset/ URLs they emit come out already root-qualified.
    const wsRel = toWorkspacePath(state.root.id, rel);
    const html = rewriteImageSrc(tagInternalLinks(rawHtml, wsRel), wsRel);
    const outline = extractOutline(tokens);
    const title =
      (typeof data?.title === 'string' ? data.title : null) ??
      outline[0]?.text ??
      null;

    const result: RenderedFile = {
      relPath: wsRel,
      html,
      outline,
      frontmatter: data,
      title,
      lastModified: mtimeMs,
    };
    return reply.send(result);
    },
  );
}
