import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { resolveSafePath } from '../fs/resolve.js';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

export function registerApiAsset(app: FastifyInstance, rootAbsPath: string): void {
  app.get<{ Params: { '*': string } }>('/__asset/*', async (req, reply) => {
    const rel = (req.params['*'] ?? '').replace(/^\/+/, '');
    let abs: string;
    try {
      abs = resolveSafePath(rootAbsPath, rel);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    let st;
    try {
      st = await stat(abs);
    } catch {
      return reply.code(404).send({ error: 'Asset not found' });
    }
    if (!st.isFile()) {
      return reply.code(404).send({ error: 'Not a file' });
    }
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME[ext];
    if (!mime) {
      // Allow-list known media types only. Without this, /__asset/.env or any
      // dotfile under the watched root would be readable by anything that can
      // reach the server (a script in a rendered .md, or any other localhost tab).
      return reply.code(404).send({ error: 'Asset type not allowed' });
    }
    reply.header('content-type', mime);
    reply.header('content-length', st.size);
    reply.header('cache-control', 'no-cache');
    return reply.send(createReadStream(abs));
  });
}
