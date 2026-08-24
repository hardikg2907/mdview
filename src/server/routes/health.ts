import type { FastifyInstance } from 'fastify';
import type { RootState } from '../workspace.js';

export interface HealthIdentity {
  pid: number;
  startedAt: number;
}

/**
 * Lets the CLI tell "our daemon is listening here" from "something else grabbed
 * that port" or "the pid was recycled".
 *
 * It reports ids, never absolute paths: `mdview ls` reads those from the local
 * workspace file, so nothing that can merely reach the port gets a map of the
 * user's disk.
 */
export function registerHealth(
  app: FastifyInstance,
  identity: HealthIdentity,
  roots: readonly RootState[],
): void {
  app.get('/api/health', async (_req, reply) =>
    reply.send({
      ok: true,
      pid: identity.pid,
      startedAt: identity.startedAt,
      roots: roots.map((r) => r.root.id),
    }),
  );
}
