import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../../src/server/index.js';
import { registerApiAsset } from '../../src/server/routes/api-asset.js';
import { registerApiFile } from '../../src/server/routes/api-file.js';
import { createWatcher, type Watcher } from '../../src/server/watcher.js';
import type { RootState } from '../../src/server/workspace.js';
import type { WatchEvent } from '../../src/shared/types.js';
import { fakeRoot } from '../helpers/roots.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(25);
  }
  return check();
}

/** A folder like $HOME: one document, the media it uses, and plenty it doesn't. */
function makeHome(doc: string): string {
  const home = mkdtempSync(path.join(tmpdir(), 'mdview-single-'));
  writeFileSync(path.join(home, 'README.md'), doc);
  mkdirSync(path.join(home, 'docs', 'img'), { recursive: true });
  writeFileSync(path.join(home, 'docs', 'img', 'a.png'), PNG);
  writeFileSync(path.join(home, 'docs', 'img', 'unused.png'), PNG);
  writeFileSync(path.join(home, 'img a.png'), PNG);
  writeFileSync(path.join(home, 'sibling.png'), PNG);
  writeFileSync(path.join(home, 'clip.mp4'), PNG);
  mkdirSync(path.join(home, 'Pictures', 'private'), { recursive: true });
  writeFileSync(path.join(home, 'Pictures', 'private', 'photo.jpg'), PNG);
  return home;
}

const DOC = [
  '# Readme',
  '',
  '![a](docs/img/a.png)',
  '![spaced](<img a.png>)',
  '![versioned](docs/img/a.png?v=2)',
  '',
  '<video src="/__asset/home/clip.mp4"></video>',
  '',
].join('\n');

describe('single-file root: /__asset/* serves only what the document references', () => {
  let home: string;
  let roots: RootState[];
  let app: FastifyInstance;

  beforeEach(async () => {
    home = makeHome(DOC);
    roots = [fakeRoot(home, { id: 'home', kind: 'file', filePath: 'README.md' })];
    app = Fastify({ logger: false });
    registerApiFile(app, roots);
    registerApiAsset(app, roots);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    rmSync(home, { recursive: true, force: true });
  });

  const REFERENCED = ['/__asset/home/docs/img/a.png', '/__asset/home/img%20a.png', '/__asset/home/clip.mp4'];
  const UNREFERENCED = [
    '/__asset/home/sibling.png',
    '/__asset/home/docs/img/unused.png',
    '/__asset/home/Pictures/private/photo.jpg',
    '/__asset/Pictures/private/photo.jpg',
  ];

  it('serves referenced media and 404s everything else in the folder', async () => {
    const doc = await app.inject({ method: 'GET', url: '/api/file' });
    expect(doc.statusCode).toBe(200);
    for (const url of REFERENCED) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
    }
    for (const url of UNREFERENCED) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
    }
  });

  it('matches a reference however the request spells the same path', async () => {
    await app.inject({ method: 'GET', url: '/api/file' });
    for (const url of ['/__asset/home/docs/./img/a.png?v=2', '/__asset/home/docs/img/a.png?cache=1', '/__asset/home/docs%2Fimg%2Fa.png']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
    }
  });

  it('works out the references itself when no render has happened yet', async () => {
    const ok = await app.inject({ method: 'GET', url: '/__asset/home/docs/img/a.png' });
    expect(ok.statusCode).toBe(200);
    const no = await app.inject({ method: 'GET', url: '/__asset/home/sibling.png' });
    expect(no.statusCode).toBe(404);
  });

  it('follows the document: a new render drops what it no longer references', async () => {
    await app.inject({ method: 'GET', url: '/api/file' });
    writeFileSync(path.join(home, 'README.md'), '# Readme\n\n![s](sibling.png)\n');
    await app.inject({ method: 'GET', url: '/api/file' });
    const gone = await app.inject({ method: 'GET', url: '/__asset/home/docs/img/a.png' });
    expect(gone.statusCode).toBe(404);
    const added = await app.inject({ method: 'GET', url: '/__asset/home/sibling.png' });
    expect(added.statusCode).toBe(200);
  });

  it('ignores a reference that climbs out of the folder', async () => {
    writeFileSync(path.join(home, 'README.md'), '# R\n\n<img src="/__asset/home/../outside.png">\n');
    await app.inject({ method: 'GET', url: '/api/file' });
    const res = await app.inject({ method: 'GET', url: '/__asset/home/..%2Foutside.png' });
    expect(res.statusCode).not.toBe(200);
  });

  it('still refuses a referenced asset under a dot-directory', async () => {
    mkdirSync(path.join(home, '.cache'));
    writeFileSync(path.join(home, '.cache', 'x.png'), PNG);
    writeFileSync(path.join(home, 'README.md'), '# R\n\n![x](.cache/x.png)\n');
    await app.inject({ method: 'GET', url: '/api/file' });
    const res = await app.inject({ method: 'GET', url: '/__asset/home/.cache/x.png' });
    expect(res.statusCode).toBe(404);
  });
});

describe('single-file root: /api/file', () => {
  let home: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    home = mkdtempSync(path.join(tmpdir(), 'mdview-single-dot-'));
    writeFileSync(path.join(home, '.notes.md'), '# Hidden notes');
    app = Fastify({ logger: false });
    registerApiFile(app, [fakeRoot(home, { id: 'home', kind: 'file', filePath: '.notes.md' })]);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(home, { recursive: true, force: true });
  });

  it('serves a dotfile the user opened by name', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/file' });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('Hidden notes');
  });
});

describe('createWatcher with only: one file, not the folder', () => {
  let home: string;
  let watcher: Watcher;
  const events: WatchEvent[] = [];
  const paths = () => events.map((e) => ('relPath' in e ? `${e.kind}:${e.relPath}` : e.kind));

  beforeAll(async () => {
    home = realpathSync(mkdtempSync(path.join(tmpdir(), 'mdview-single-watch-')));
    writeFileSync(path.join(home, 'README.md'), '# one');
    mkdirSync(path.join(home, 'deep', 'er'), { recursive: true });
    watcher = createWatcher(home, { prefix: 'home', only: 'README.md' });
    watcher.on('event', (e) => events.push(e));
    await sleep(400);
  });

  afterAll(async () => {
    await watcher.close();
    rmSync(home, { recursive: true, force: true });
  });

  it('reports an in-place save', async () => {
    events.length = 0;
    writeFileSync(path.join(home, 'README.md'), '# two');
    expect(await waitFor(() => paths().includes('change:home/README.md'), 3000)).toBe(true);
  });

  it('reports a save that writes a temp file and renames it over the original, every time', async () => {
    for (let i = 0; i < 3; i++) {
      events.length = 0;
      const tmp = path.join(home, `.README.md.${i}.tmp`);
      writeFileSync(tmp, `# atomic ${i}`);
      renameSync(tmp, path.join(home, 'README.md'));
      expect(await waitFor(() => paths().some((p) => p.endsWith(':home/README.md')), 3000), `save ${i}`).toBe(true);
    }
  });

  it('reports a save that moves the original aside first', async () => {
    events.length = 0;
    const file = path.join(home, 'README.md');
    renameSync(file, `${file}~`);
    writeFileSync(file, '# backup-style');
    rmSync(`${file}~`);
    expect(await waitFor(() => paths().some((p) => p.endsWith(':home/README.md')), 3000)).toBe(true);
    // And keeps watching after it.
    events.length = 0;
    await sleep(200);
    writeFileSync(file, '# after');
    expect(await waitFor(() => paths().includes('change:home/README.md'), 3000)).toBe(true);
  });

  it('says nothing about the rest of the folder, at any depth', async () => {
    events.length = 0;
    writeFileSync(path.join(home, 'other.md'), '# other');
    writeFileSync(path.join(home, 'deep', 'er', 'nested.md'), '# nested');
    mkdirSync(path.join(home, 'newdir'));
    await sleep(600);
    expect(paths().filter((p) => !p.endsWith(':home/README.md'))).toEqual([]);
  });
});

describe('single-file root in a real server: an edit updates what may be served', () => {
  let home: string;
  let clientDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    home = realpathSync(makeHome('# R\n\n![a](docs/img/a.png)\n'));
    clientDir = mkdtempSync(path.join(tmpdir(), 'mdview-single-client-'));
    writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>t</title>');
    ({ app } = await createServer({
      roots: [{ absPath: home, kind: 'file', id: 'home', filePath: 'README.md' }],
      clientDir,
    }));
    await sleep(400);
  });

  afterAll(async () => {
    await app.close();
    rmSync(home, { recursive: true, force: true });
    rmSync(clientDir, { recursive: true, force: true });
  });

  it('drops an asset the saved document no longer references, without a re-render request', async () => {
    const before = await app.inject({ method: 'GET', url: '/__asset/home/docs/img/a.png' });
    expect(before.statusCode).toBe(200);
    const tmp = path.join(home, '.README.md.tmp');
    writeFileSync(tmp, '# R\n\nno images now\n');
    renameSync(tmp, path.join(home, 'README.md'));
    const dropped = await waitFor(async () => {
      const res = await app.inject({ method: 'GET', url: '/__asset/home/docs/img/a.png' });
      return res.statusCode === 404;
    }, 3000);
    expect(dropped).toBe(true);
  });
});
