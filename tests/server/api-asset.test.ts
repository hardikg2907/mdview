import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../../src/server/index.js';
import { registerApiAsset } from '../../src/server/routes/api-asset.js';
import { fakeRoot } from '../helpers/roots.js';

describe('GET /__asset/* (extension allow-list)', () => {
  let root: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'mdview-asset-'));
    writeFileSync(path.join(root, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(path.join(root, '.env'), 'SECRET=hunter2');
    writeFileSync(path.join(root, 'config.ts'), 'export const x = 1;');
    writeFileSync(path.join(root, 'secrets.json'), '{"k":"v"}');
    writeFileSync(path.join(root, 'notes.txt'), 'private notes');
    writeFileSync(path.join(root, 'paper.pdf'), '%PDF-1.4');
    mkdirSync(path.join(root, '.git'));
    writeFileSync(path.join(root, '.git', 'config'), '[core]');
    writeFileSync(path.join(root, '.git', 'shot.png'), Buffer.from([0x89, 0x50]));
    mkdirSync(path.join(root, 'img'));
    writeFileSync(path.join(root, 'img', '.hidden.png'), Buffer.from([0x89, 0x50]));

    app = Fastify({ logger: false });
    registerApiAsset(app, [fakeRoot(root, { id: 'w' })]);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('serves allow-listed image extensions', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/pic.png' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('404s on dotfile (.env) — extension not in allow-list', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/.env' });
    expect(res.statusCode).toBe(404);
  });

  it('404s on source files (.ts)', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/config.ts' });
    expect(res.statusCode).toBe(404);
  });

  it('404s on .json (not media)', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/secrets.json' });
    expect(res.statusCode).toBe(404);
  });

  it('404s on .txt and .pdf (not media)', async () => {
    for (const url of ['/__asset/notes.txt', '/__asset/paper.pdf']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
    }
  });

  it('404s on files inside .git', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/.git/config' });
    expect(res.statusCode).toBe(404);
  });

  it('404s on a media file under any dot segment', async () => {
    for (const url of ['/__asset/.git/shot.png', '/__asset/img/.hidden.png']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
    }
  });

  it('judges a dot segment after normalising the path', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/img/..%2fpic.png' });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /__asset/* response headers', () => {
  let root: string;
  let clientDir: string;
  let app: FastifyInstance;
  const H = { host: '127.0.0.1' };

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'mdview-asset-hdr-'));
    clientDir = mkdtempSync(path.join(tmpdir(), 'mdview-asset-client-'));
    writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>t</title>');
    writeFileSync(
      path.join(root, 'evil.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/tree")</script></svg>',
    );
    ({ app } = await createServer({
      roots: [{ absPath: root, kind: 'dir', id: 'w' }],
      clientDir,
    }));
  });

  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(clientDir, { recursive: true, force: true });
  });

  function expectAssetHeaders(res: { headers: Record<string, unknown> }, label: string): void {
    const csp = String(res.headers['content-security-policy'] ?? '');
    expect(csp, label).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'",
    );
    expect(res.headers['x-content-type-options'], label).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy'], label).toBe('same-origin');
  }

  it('sandboxes a served SVG', async () => {
    const res = await app.inject({ url: '/__asset/w/evil.svg', headers: H });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/svg+xml');
    expectAssetHeaders(res, 'svg');
  });

  it('sends the same headers on every error reply', async () => {
    const cases: Array<[string, string, number]> = [
      ['GET', '/__asset/w/missing.png', 404],
      ['GET', '/__asset/w/evil.txt', 404],
      ['GET', `/__asset/w/${'..%2f'.repeat(6)}etc/hosts`, 400],
      ['POST', '/__asset/w/evil.svg', 404],
    ];
    for (const [method, url, status] of cases) {
      const res = await app.inject({ method: method as 'GET', url, headers: H });
      expect(res.statusCode, url).toBe(status);
      expectAssetHeaders(res, `${method} ${url}`);
    }
  });

  it('keeps the SPA policy off asset responses and on the shell', async () => {
    const shell = await app.inject({ url: '/', headers: H });
    const csp = String(shell.headers['content-security-policy']);
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('sandbox');
  });
});
