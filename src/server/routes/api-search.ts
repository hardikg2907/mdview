import type { FastifyInstance } from 'fastify';
import { grepFiles } from '../fs/grep.js';
import type { RootInfo } from '../../shared/types.js';

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

export function registerApiSearch(
  app: FastifyInstance,
  rootAbsPath: string,
  rootInfo: RootInfo,
): void {
  app.get<{ Querystring: SearchQS }>('/api/search', async (req, reply) => {
    if (rootInfo.rootKind === 'file') {
      return reply.send({ query: req.query.q ?? '', results: [], truncated: false });
    }
    const q = (req.query.q ?? '').trim();
    if (q.length === 0) {
      return reply.send({ query: '', results: [], truncated: false });
    }
    if (q.length > MAX_QUERY_LEN) {
      return reply.code(400).send({ error: 'Query too long' });
    }
    const out = await grepFiles(rootAbsPath, q, {
      caseSensitive: isTrue(req.query.case),
      wholeWord: isTrue(req.query.word),
      regex: isTrue(req.query.regex),
    });
    return reply.send(out);
  });
}
