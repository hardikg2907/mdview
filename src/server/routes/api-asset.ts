import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { hasDotSegment, OutsideRootError, resolveSafePath } from '../fs/resolve.js';
import { parseWorkspacePath, type RootState } from '../workspace.js';
import { assetRefKey, documentAssetRefs } from './api-file.js';

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
};

/**
 * Sent on every /__asset/* response, success or error. A policy on a
 * subresource does not affect its use in <img>/<video>/<audio>; it only bites
 * when the asset is opened as a document. Then `sandbox` gives it an opaque
 * origin with no script, so an SVG cannot read other files. CORP stops other
 * sites embedding the user's files through the loopback port.
 */
export const ASSET_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin',
};

export function registerApiAsset(app: FastifyInstance, roots: readonly RootState[]): void {
  app.get<{ Params: { '*': string } }>('/__asset/*', async (req, reply) => {
    const wsPath = (req.params['*'] ?? '').replace(/^\/+/, '');
    const resolved = parseWorkspacePath(roots, wsPath);
    if (!resolved) {
      return reply.code(404).send({ error: 'Asset not found' });
    }
    // A single-file root is a whole folder on disk (`mdview ~/README.md` makes
    // it $HOME), but all it shows is one document, so it serves only what that
    // document references.
    if (resolved.state.root.kind === 'file') {
      const refs = await documentAssetRefs(roots, resolved.state);
      if (!refs.has(assetRefKey(resolved.rel))) {
        return reply.code(404).send({ error: 'Asset not found' });
      }
    }
    let abs: string;
    let realRoot: string;
    try {
      realRoot = await realpath(resolved.state.absPath);
      abs = await resolveSafePath(resolved.state.absPath, resolved.rel, { realRoot });
    } catch (err) {
      if (err instanceof OutsideRootError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(404).send({ error: 'Asset not found' });
    }
    // Whatever the extension of the file inside them.
    if (hasDotSegment(resolved.rel) || hasDotSegment(path.relative(realRoot, abs))) {
      return reply.code(404).send({ error: 'Asset not found' });
    }
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(abs);
    } catch {
      return reply.code(404).send({ error: 'Asset not found' });
    }
    if (!st.isFile()) {
      return reply.code(404).send({ error: 'Not a file' });
    }
    // Both names must be media: the one asked for, and the file an in-root
    // link actually lands on (`logo.png -> id_ed25519.pub` is not an image).
    const mime = MIME[path.extname(abs).toLowerCase()];
    if (!mime || !MIME[path.extname(resolved.rel).toLowerCase()]) {
      // Media types only: the route exists for <img>, <video> and <audio> in
      // rendered documents. Source, config and keys under the root stay unreadable.
      return reply.code(404).send({ error: 'Asset type not allowed' });
    }
    reply.header('content-type', mime);
    reply.header('content-length', st.size);
    reply.header('cache-control', 'no-cache');
    return reply.send(createReadStream(abs));
  });
}
