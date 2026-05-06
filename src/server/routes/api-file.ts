import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolveSafePath } from '../fs/resolve.js';
import { renderMarkdown } from '../render/markdown.js';
import { extractOutline } from '../render/outline.js';
import { parseFrontmatter } from '../render/frontmatter.js';
import { tagInternalLinks } from '../render/links.js';
import type { RenderedFile, RootInfo } from '../../shared/types.js';

export function registerApiFile(
  app: FastifyInstance,
  rootAbsPath: string,
  rootInfo: RootInfo,
): void {
  app.get<{ Querystring: { path?: string } }>('/api/file', async (req, reply) => {
    const requested = req.query.path?.trim() ?? '';
    let relPath: string;

    if (rootInfo.rootKind === 'file') {
      if (requested && requested !== rootInfo.rootRelPath) {
        return reply.code(404).send({ error: 'File not found in single-file mode' });
      }
      relPath = rootInfo.rootRelPath;
    } else {
      if (!requested) {
        return reply.code(400).send({ error: 'Missing ?path' });
      }
      relPath = requested;
    }

    let absPath: string;
    try {
      absPath = resolveSafePath(rootAbsPath, relPath);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    let raw: string;
    try {
      raw = await readFile(absPath, 'utf8');
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }

    const { data, body } = parseFrontmatter(raw);
    const { html: rawHtml, tokens } = await renderMarkdown(body);
    const html = tagInternalLinks(rawHtml, relPath);
    const outline = extractOutline(tokens);
    const title =
      (typeof data?.title === 'string' ? data.title : null) ??
      outline[0]?.text ??
      null;

    const result: RenderedFile = { relPath, html, outline, frontmatter: data, title };
    return reply.send(result);
  });
}
