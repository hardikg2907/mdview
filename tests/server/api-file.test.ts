import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerApiFile } from '../../src/server/routes/api-file.js';
import type { RootInfo } from '../../src/shared/types.js';

describe('GET /api/file (markdown-only)', () => {
  let root: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'mdview-file-'));
    writeFileSync(path.join(root, 'README.md'), '# Hello\n\nbody');
    writeFileSync(path.join(root, '.env'), 'SECRET=hunter2');
    writeFileSync(path.join(root, 'notes.txt'), 'plain text');

    const rootInfo: RootInfo = { rootKind: 'dir', rootRelPath: '', rootName: path.basename(root) };
    app = Fastify({ logger: false });
    registerApiFile(app, root, rootInfo);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('200s on a real .md file', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=README.md' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ relPath: 'README.md' });
  });

  it('400s on .env (no markdown extension)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=.env' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: expect.stringMatching(/markdown/i) });
  });

  it('400s on .txt', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=notes.txt' });
    expect(res.statusCode).toBe(400);
  });

  it('400s when ?path is missing in folder mode', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file' });
    expect(res.statusCode).toBe(400);
  });
});
