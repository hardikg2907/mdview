import type { FastifyInstance } from 'fastify';
import { ContentCache, type GrepRoot, grepFiles } from '../fs/grep.js';
import type { RootState } from '../workspace.js';

const MAX_QUERY_LEN = 200;

interface SearchQS {
  q?: string;
  case?: string;
  word?: string;
  regex?: string;
}

export interface ApiSearchOptions {
  /** Shared with the watcher hook that invalidates it. */
  cache?: ContentCache;
  /** Overrides the regex matching budget. */
  regexBudgetMs?: number;
}

function isTrue(v: string | undefined): boolean {
  return v === '1' || v === 'true';
}

export function registerApiSearch(
  app: FastifyInstance,
  roots: readonly RootState[],
  opts: ApiSearchOptions = {},
): void {
  const cache = opts.cache ?? new ContentCache();
  app.get<{ Querystring: SearchQS }>('/api/search', async (req, reply) => {
    const q = (req.query.q ?? '').trim();
    if (q.length === 0) {
      return reply.send({ query: '', results: [], truncated: false, timedOut: false });
    }
    if (q.length > MAX_QUERY_LEN) {
      return reply.code(400).send({ error: 'Query too long' });
    }
    // Single-file roots contribute nothing: folder search over a root that is
    // one file duplicates the in-document search the client already runs.
    const searchable: GrepRoot[] = roots
      .filter((r) => r.root.kind === 'dir')
      .map((r) => ({ absPath: r.absPath, id: r.root.id, ignore: r.ignoreSet }));

    // The client aborts a search as soon as the query changes. The response
    // closing before it was written is how that shows up here, and the work
    // behind it (reads, a busy regex worker) is dropped rather than finished.
    const ac = new AbortController();
    const onClose = (): void => {
      if (!reply.raw.writableFinished) ac.abort();
    };
    reply.raw.once('close', onClose);
    try {
      const out = await grepFiles(searchable, q, {
        caseSensitive: isTrue(req.query.case),
        wholeWord: isTrue(req.query.word),
        regex: isTrue(req.query.regex),
        cache,
        signal: ac.signal,
        ...(opts.regexBudgetMs !== undefined ? { regexBudgetMs: opts.regexBudgetMs } : {}),
      });
      return reply.send(out);
    } catch {
      return reply.code(500).send({ error: 'Search failed' });
    } finally {
      reply.raw.off('close', onClose);
    }
  });
}
