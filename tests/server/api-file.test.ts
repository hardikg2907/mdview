import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerApiFile } from '../../src/server/routes/api-file.js';
import { fakeRoot } from '../helpers/roots.js';

describe('GET /api/file (markdown-only)', () => {
  let root: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'mdview-file-'));
    writeFileSync(path.join(root, 'README.md'), '# Hello\n\nbody');
    writeFileSync(path.join(root, 'code.md'), '```ts\nconst x = 1;\n```\n');
    writeFileSync(path.join(root, '.env'), 'SECRET=hunter2');
    writeFileSync(path.join(root, 'notes.txt'), 'plain text');

    app = Fastify({ logger: false });
    registerApiFile(app, [fakeRoot(root, { id: 'w' })]);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  describe('?palette', () => {
    async function html(query: string): Promise<string> {
      const res = await app.inject({ method: 'GET', url: `/api/file?path=code.md${query}` });
      expect(res.statusCode).toBe(200);
      return (res.json() as { html: string }).html;
    }

    it('renders the requested palette', async () => {
      const [a, b] = await Promise.all([html('&palette=everforest'), html('&palette=catppuccin')]);
      expect(a).toContain('--shiki-light');
      expect(a).not.toEqual(b);
    });

    it('falls back to the default for an unknown palette instead of failing', async () => {
      // The document is what was asked for; only the colours are in question,
      // and those are recoverable by picking a palette again.
      expect(await html('&palette=banana')).toEqual(await html(''));
    });

    it('does not reflect the raw value into the response', async () => {
      const probe = '<img src=x onerror=alert(1)>';
      const body = await html(`&palette=${encodeURIComponent(probe)}`);
      expect(body).not.toContain('onerror');
      expect(body).toEqual(await html(''));
    });
  });

  it('200s on a real .md file', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=README.md' });
    expect(res.statusCode).toBe(200);
    // An unprefixed request resolves against the primary root, and the response
    // comes back workspace-scoped.
    expect(res.json()).toMatchObject({ relPath: 'w/README.md' });
  });

  it('200s on an explicitly root-prefixed path', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=w/README.md' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ relPath: 'w/README.md' });
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
