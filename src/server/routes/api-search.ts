import type { FastifyInstance } from 'fastify';
import { type GrepRoot, grepFiles } from '../fs/grep.js';
import type { RootState } from '../workspace.js';

const MAX_QUERY_LEN = 200;

interface SearchQS {
  q?: string;
  case?: string;
  word?: string;
  regex?: string;
}

function isTrue(v: string | undefined): boolean {
  return v === '1' || v === 'true';
}

export function registerApiSearch(app: FastifyInstance, roots: readonly RootState[]): void {
  app.get<{ Querystring: SearchQS }>('/api/search', async (req, reply) => {
    const q = (req.query.q ?? '').trim();
    if (q.length === 0) {
      return reply.send({ query: '', results: [], truncated: false });
    }
    if (q.length > MAX_QUERY_LEN) {
      return reply.code(400).send({ error: 'Query too long' });
    }
    // Single-file roots contribute nothing: folder search over a root that is
    // one file duplicates the in-document search the client already runs.
    const searchable: GrepRoot[] = roots
      .filter((r) => r.root.kind === 'dir')
      .map((r) => ({ absPath: r.absPath, id: r.root.id, ignore: r.ignoreSet }));
    const out = await grepFiles(searchable, q, {
      caseSensitive: isTrue(req.query.case),
      wholeWord: isTrue(req.query.word),
      regex: isTrue(req.query.regex),
    });
    return reply.send(out);
  });
}
