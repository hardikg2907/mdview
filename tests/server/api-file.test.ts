import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
    writeFileSync(
      path.join(root, 'evil.md'),
      '---js\n{ ranInServer: typeof process === "object", pid: process.pid }\n---\n# Hello',
    );
    writeFileSync(path.join(root, 'anchors.md'), `<div>\n${'<a '.repeat(400_000)}\n`);
    writeFileSync(path.join(root, '.env'), 'SECRET=hunter2');
    writeFileSync(path.join(root, 'notes.txt'), 'plain text');
    mkdirSync(path.join(root, '.github'));
    writeFileSync(path.join(root, '.github', 'PR.md'), '# PR template');
    mkdirSync(path.join(root, '.claude'));
    writeFileSync(path.join(root, '.claude', 'CLAUDE.md'), '# Agent notes');
    writeFileSync(path.join(root, '.draft.md'), '# Draft');

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

  it('does not evaluate a ---js front matter block', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=evil.md' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ frontmatter: null });
    expect(res.body).not.toContain(`"pid":${process.pid}`);
  });

  it('answers quickly for a large HTML block of unclosed anchors', async () => {
    const start = performance.now();
    const res = await app.inject({ method: 'GET', url: '/api/file?path=anchors.md' });
    expect(res.statusCode).toBe(200);
    expect(performance.now() - start).toBeLessThan(2_000);
  });

  it('400s on .env (no markdown extension)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=.env' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: expect.stringMatching(/markdown/i) });
  });

  it('serves markdown inside a dot-directory, which a README may link to', async () => {
    for (const p of ['.github/PR.md', 'w/.github/PR.md', '.claude/CLAUDE.md']) {
      const res = await app.inject({ method: 'GET', url: `/api/file?path=${p}` });
      expect(res.statusCode, p).toBe(200);
    }
  });

  it('400s on .txt', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=notes.txt' });
    expect(res.statusCode).toBe(400);
  });

  it('400s when ?path is missing in folder mode', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file' });
    expect(res.statusCode).toBe(400);
  });

  it('404s on a missing markdown file', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=missing.md' });
    expect(res.statusCode).toBe(404);
  });

  it('413s on a markdown file over 16 MB without reading it', async () => {
    writeFileSync(path.join(root, 'huge.md'), Buffer.alloc(16 * 1024 * 1024 + 1, 0x61));
    const res = await app.inject({ method: 'GET', url: '/api/file?path=huge.md' });
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toMatch(/too large/);
  });
});

describe.skipIf(process.platform === 'win32')('GET /api/file (symlinks)', () => {
  let base: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    base = mkdtempSync(path.join(tmpdir(), 'mdview-file-link-'));
    const root = path.join(base, 'root');
    mkdirSync(root);
    mkdirSync(path.join(base, 'outside'));
    writeFileSync(path.join(base, 'outside', 'secret'), 'TOP-SECRET');
    writeFileSync(path.join(root, 'README.md'), '# Real');
    writeFileSync(path.join(root, '.env'), 'SECRET=hunter2');
    symlinkSync('../outside/secret', path.join(root, 'leak.md'));
    symlinkSync('/etc/hosts', path.join(root, 'hosts.md'));
    symlinkSync('README.md', path.join(root, 'alias.md'));
    symlinkSync('.env', path.join(root, 'env.md'));
    mkdirSync(path.join(root, '.claude'));
    writeFileSync(path.join(root, '.claude', 'CLAUDE.md'), '# Agent notes');
    symlinkSync(path.join('.claude', 'CLAUDE.md'), path.join(root, 'agent.md'));

    app = Fastify({ logger: false });
    registerApiFile(app, [fakeRoot(root, { id: 'w' })]);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(base, { recursive: true, force: true });
  });

  it('refuses a link that leads out of the root', async () => {
    for (const p of ['leak.md', 'hosts.md']) {
      const res = await app.inject({ method: 'GET', url: `/api/file?path=${p}` });
      expect(res.statusCode, p).toBe(400);
      expect(res.body).not.toContain('TOP-SECRET');
    }
  });

  it('follows a link that stays inside the root', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=alias.md' });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('Real');
  });

  it('follows an in-root link whose target sits in a dot-directory', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=agent.md' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Agent notes');
  });

  it('refuses an in-root link whose target is not markdown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file?path=env.md' });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('hunter2');
  });
});
