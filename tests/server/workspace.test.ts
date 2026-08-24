import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerApiAsset } from '../../src/server/routes/api-asset.js';
import { registerApiFile } from '../../src/server/routes/api-file.js';
import { registerApiSearch } from '../../src/server/routes/api-search.js';
import { registerApiTree } from '../../src/server/routes/api-tree.js';
import {
  deriveRootId,
  isValidRootId,
  parseWorkspacePath,
  type RootState,
  toWorkspacePath,
} from '../../src/server/workspace.js';
import type { TreeNode } from '../../src/shared/types.js';
import { fakeRoot } from '../helpers/roots.js';

describe('isValidRootId', () => {
  it('accepts a single lowercase path segment', () => {
    for (const id of ['docs', 'my-repo', 'a', 'v1.2', 'a_b', 'x'.repeat(64)]) {
      expect(isValidRootId(id), id).toBe(true);
    }
  });

  it('rejects anything that is not one plain segment', () => {
    for (const id of [
      '',
      '.',
      '..',
      'a/b',
      'a\\b',
      '../etc',
      'Docs', // uppercase — ids are generated lowercase
      '-lead',
      '.lead',
      'has space',
      'x'.repeat(65),
    ]) {
      expect(isValidRootId(id), JSON.stringify(id)).toBe(false);
    }
  });
});

describe('deriveRootId', () => {
  it('slugs the folder name', () => {
    expect(deriveRootId('/home/me/My Docs', new Set())).toBe('my-docs');
    expect(deriveRootId('/home/me/houston', new Set())).toBe('houston');
  });

  it('disambiguates against ids already in use', () => {
    expect(deriveRootId('/a/docs', new Set(['docs']))).toBe('docs-2');
    expect(deriveRootId('/b/docs', new Set(['docs', 'docs-2']))).toBe('docs-3');
  });

  it('falls back to a usable id when the name slugs away to nothing', () => {
    expect(deriveRootId('/', new Set())).toBe('root');
    expect(deriveRootId('/x/...', new Set())).toBe('root');
  });
});

describe('parseWorkspacePath', () => {
  const a = fakeRoot('/tmp/a', { id: 'alpha' });
  const b = fakeRoot('/tmp/b', { id: 'beta' });
  const roots = [a, b];

  it('routes a prefixed path to the named root', () => {
    expect(parseWorkspacePath(roots, 'beta/docs/x.md')).toEqual({ state: b, rel: 'docs/x.md' });
  });

  it('treats an unknown first segment as a path in the primary root', () => {
    // This is what keeps pre-workspace ?file= links and the VS Code extension
    // (which sends bare workspace-relative paths) working.
    expect(parseWorkspacePath(roots, 'docs/x.md')).toEqual({ state: a, rel: 'docs/x.md' });
    expect(parseWorkspacePath(roots, 'README.md')).toEqual({ state: a, rel: 'README.md' });
  });

  it('yields an empty remainder for a bare root id', () => {
    expect(parseWorkspacePath(roots, 'beta')).toEqual({ state: b, rel: '' });
  });

  it('tolerates leading slashes', () => {
    expect(parseWorkspacePath(roots, '/beta/x.md')).toEqual({ state: b, rel: 'x.md' });
  });

  it('returns null when nothing is open', () => {
    expect(parseWorkspacePath([], 'alpha/x.md')).toBeNull();
  });

  it('does not itself resolve traversal — it only strips the root segment', () => {
    // Containment is resolveSafePath's job; this asserts the split is not doing
    // anything clever that could mask a traversal from it.
    expect(parseWorkspacePath(roots, 'beta/../../etc/passwd')).toEqual({
      state: b,
      rel: '../../etc/passwd',
    });
  });
});

describe('toWorkspacePath', () => {
  it('joins, and degrades to the bare id for an empty path', () => {
    expect(toWorkspacePath('alpha', 'docs/x.md')).toBe('alpha/docs/x.md');
    expect(toWorkspacePath('alpha', '')).toBe('alpha');
  });
});

describe('two unrelated roots on one server', () => {
  let dirA: string;
  let dirB: string;
  let app: FastifyInstance;
  let roots: RootState[];

  beforeAll(async () => {
    dirA = mkdtempSync(path.join(tmpdir(), 'mdview-ws-a-'));
    dirB = mkdtempSync(path.join(tmpdir(), 'mdview-ws-b-'));

    writeFileSync(path.join(dirA, 'README.md'), '# Alpha\n\nmentions coriander\n');
    mkdirSync(path.join(dirA, 'guide'));
    writeFileSync(path.join(dirA, 'guide', 'intro.md'), '# Intro\n\n![pic](../logo.png)\n');
    writeFileSync(path.join(dirA, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(path.join(dirA, 'secret.env'), 'TOKEN=alpha');

    writeFileSync(path.join(dirB, 'README.md'), '# Beta\n\nalso mentions coriander\n');
    writeFileSync(path.join(dirB, 'only-in-b.md'), '# Only B\n');

    roots = [fakeRoot(dirA, { id: 'alpha' }), fakeRoot(dirB, { id: 'beta' })];
    app = Fastify({ logger: false });
    registerApiFile(app, roots);
    registerApiTree(app, roots);
    registerApiAsset(app, roots);
    registerApiSearch(app, roots);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  });

  it('groups each root as a top-level folder once more than one is open', async () => {
    const res = await app.inject({ url: '/api/tree' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { roots: { id: string }[]; tree: TreeNode[] };
    expect(body.roots.map((r) => r.id)).toEqual(['alpha', 'beta']);
    expect(body.tree.map((n) => n.relPath)).toEqual(['alpha', 'beta']);
    const alphaChildren = body.tree[0]?.children?.map((n) => n.relPath) ?? [];
    expect(alphaChildren).toContain('alpha/README.md');
    expect(alphaChildren).toContain('alpha/guide');
  });

  it('serves the right file from each root even though basenames collide', async () => {
    const a = await app.inject({ url: '/api/file?path=alpha/README.md' });
    const b = await app.inject({ url: '/api/file?path=beta/README.md' });
    expect(a.json()).toMatchObject({ relPath: 'alpha/README.md', title: 'Alpha' });
    expect(b.json()).toMatchObject({ relPath: 'beta/README.md', title: 'Beta' });
  });

  it('rewrites images to a root-qualified asset URL', async () => {
    const res = await app.inject({ url: '/api/file?path=alpha/guide/intro.md' });
    expect(res.json().html).toContain('src="/__asset/alpha/logo.png"');
  });

  it('serves an asset through its root prefix', async () => {
    const res = await app.inject({ url: '/__asset/alpha/logo.png' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('searches every folder root and labels hits by root', async () => {
    const res = await app.inject({ url: '/api/search?q=coriander' });
    const paths = (res.json().results as { relPath: string }[]).map((r) => r.relPath).sort();
    expect(paths).toEqual(['alpha/README.md', 'beta/README.md']);
  });

  it('refuses to escape a root via traversal after the prefix', async () => {
    const target = `beta/${'../'.repeat(6)}etc/passwd`;
    const res = await app.inject({ url: `/api/file?path=${encodeURIComponent(target)}` });
    expect(res.statusCode).toBe(400);
  });

  it('refuses traversal on an unprefixed path too', async () => {
    const res = await app.inject({ url: '/api/file?path=../../../../etc/passwd' });
    expect(res.statusCode).toBe(400);
  });

  it('refuses traversal through the asset route at both layers', async () => {
    // Raw `../` never reaches the handler: the router normalises the path first
    // and then matches nothing.
    const raw = await app.inject({ url: `/__asset/alpha/${'../'.repeat(6)}etc/hosts` });
    expect(raw.statusCode).toBe(404);

    // Percent-encoded `../` survives routing and arrives in the splat intact,
    // so resolveSafePath is the only thing standing between it and the file.
    const encoded = await app.inject({
      url: `/__asset/alpha/${'..%2f'.repeat(6)}etc/hosts`,
    });
    expect(encoded.statusCode).toBe(400);
  });

  it('refuses percent-encoded traversal through the file route', async () => {
    const encoded = await app.inject({
      url: `/api/file?path=alpha/${'..%2F'.repeat(6)}etc/passwd.md`,
    });
    expect(encoded.statusCode).toBe(400);
  });

  it('cannot reach one root by naming another as a bare directory', async () => {
    // dirB is not inside dirA, so no relative path from alpha can reach it.
    const res = await app.inject({ url: '/api/file?path=alpha/only-in-b.md' });
    expect(res.statusCode).toBe(404);
  });

  it('still refuses non-markdown and non-media through their routes', async () => {
    expect((await app.inject({ url: '/api/file?path=alpha/secret.env' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/__asset/alpha/secret.env' })).statusCode).toBe(404);
  });

  it('does not put absolute paths on the wire', async () => {
    const res = await app.inject({ url: '/api/tree' });
    expect(res.body).not.toContain(dirA);
    expect(res.body).not.toContain(tmpdir());
  });
});

describe('a single root keeps its contents at the top level', () => {
  let dir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'mdview-ws-solo-'));
    writeFileSync(path.join(dir, 'README.md'), '# Solo\n');
    app = Fastify({ logger: false });
    registerApiTree(app, [fakeRoot(dir, { id: 'solo' })]);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('has no wrapper node, but paths are still root-scoped', async () => {
    const body = (await app.inject({ url: '/api/tree' })).json() as {
      roots: { id: string }[];
      tree: TreeNode[];
    };
    expect(body.roots.map((r) => r.id)).toEqual(['solo']);
    expect(body.tree.map((n) => n.relPath)).toEqual(['solo/README.md']);
  });
});
