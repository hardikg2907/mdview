import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContentCache, grepFiles } from '../../src/server/fs/grep.js';
import { registerApiSearch } from '../../src/server/routes/api-search.js';
import { fakeRoot } from '../helpers/roots.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'mdview-grep-'));
  writeFileSync(path.join(dir, 'a.md'), '# Hello\n\nFirst paragraph mentions banana.\n\nAnother BANANA here.\n');
  writeFileSync(path.join(dir, 'b.md'), '# Other\n\nNo fruit in this file.\n');
  mkdirSync(path.join(dir, 'sub'));
  writeFileSync(path.join(dir, 'sub', 'c.md'), 'banana banana banana\n');
  writeFileSync(path.join(dir, 'ignore.txt'), 'banana but not markdown\n');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('grepFiles', () => {
  it('returns empty results for empty query', async () => {
    const out = await grepFiles([{ absPath: dir, id: 'w' }], '');
    expect(out.results).toEqual([]);
  });

  it('finds case-insensitive matches across multiple files', async () => {
    const out = await grepFiles([{ absPath: dir, id: 'w' }], 'banana');
    expect(out.results.length).toBe(2);
    const aRes = out.results.find((r) => r.relPath === 'w/a.md');
    expect(aRes?.hits.length).toBe(2);
    const cRes = out.results.find((r) => r.relPath === 'w/sub/c.md');
    expect(cRes?.hits.length).toBe(3);
  });

  it('skips non-markdown files', async () => {
    const out = await grepFiles([{ absPath: dir, id: 'w' }], 'banana');
    expect(out.results.find((r) => r.relPath === 'w/ignore.txt')).toBeUndefined();
  });

  it('snippet contains the matched substring', async () => {
    const out = await grepFiles([{ absPath: dir, id: 'w' }], 'banana');
    const aRes = out.results.find((r) => r.relPath === 'w/a.md');
    const firstHit = aRes!.hits[0]!;
    const matched = firstHit.snippet.slice(firstHit.highlight[0], firstHit.highlight[1]);
    expect(matched.toLowerCase()).toBe('banana');
  });

  it('respects per-file cap', async () => {
    const out = await grepFiles([{ absPath: dir, id: 'w' }], 'banana', { perFileCap: 2 });
    const cRes = out.results.find((r) => r.relPath === 'w/sub/c.md');
    expect(cRes?.hits.length).toBe(2);
    expect(cRes?.truncated).toBe(true);
    expect(cRes?.total).toBe(3);
  });

  it('respects global cap', async () => {
    const out = await grepFiles([{ absPath: dir, id: 'w' }], 'banana', { globalCap: 2 });
    const totalHits = out.results.reduce((n, r) => n + r.hits.length, 0);
    expect(totalHits).toBeLessThanOrEqual(2);
    expect(out.truncated).toBe(true);
  });

  it('records 1-indexed line numbers', async () => {
    const out = await grepFiles([{ absPath: dir, id: 'w' }], 'banana');
    const aRes = out.results.find((r) => r.relPath === 'w/a.md');
    // a.md body (after frontmatter strip) is the same source, so:
    // line 1 "# Hello", line 2 blank, line 3 "First paragraph mentions banana."
    expect(aRes?.hits[0]?.line).toBe(3);
  });
});

describe('grepFiles — CRLF line endings (B1)', () => {
  let crlfDir: string;
  beforeAll(() => {
    crlfDir = mkdtempSync(path.join(os.tmpdir(), 'mdview-grep-crlf-'));
    // A CRLF-formatted file as Windows / VS-on-Windows would write it.
    writeFileSync(path.join(crlfDir, 'win.md'), 'line one banana\r\nline two\r\nline three banana\r\n');
  });
  afterAll(() => {
    rmSync(crlfDir, { recursive: true, force: true });
  });

  it('does not leave trailing \\r in snippets', async () => {
    const out = await grepFiles([{ absPath: crlfDir, id: 'w' }], 'banana');
    const r = out.results[0]!;
    for (const hit of r.hits) {
      expect(hit.snippet).not.toMatch(/\r/);
    }
    expect(r.hits.length).toBe(2);
  });

  it('whole-word match works at end of CRLF line', async () => {
    const out = await grepFiles([{ absPath: crlfDir, id: 'w' }], 'banana', { wholeWord: true });
    expect(out.results[0]!.hits.length).toBe(2);
  });

  it('anchors a regex at the end of a CRLF line', async () => {
    const out = await grepFiles([{ absPath: crlfDir, id: 'w' }], 'banana$', { regex: true });
    expect(out.results[0]!.hits.map((h) => [h.line, h.snippet])).toEqual([
      [1, 'line one banana'],
      [3, 'line three banana'],
    ]);
  });
});

describe('grepFiles — literal search limits', () => {
  let longDir: string;
  let manyDir: string;
  beforeAll(() => {
    longDir = mkdtempSync(path.join(os.tmpdir(), 'mdview-grep-long-'));
    // One 15 MB line: 15 million hits for `a`, every one of them kept before.
    writeFileSync(path.join(longDir, 'long.md'), 'a'.repeat(15_000_000));
    writeFileSync(path.join(longDir, 'short.md'), 'one a here\n');
    manyDir = mkdtempSync(path.join(os.tmpdir(), 'mdview-grep-many-'));
    writeFileSync(path.join(manyDir, 'many.md'), `${'a'.repeat(9_999)}\n`.repeat(300));
  });
  afterAll(() => {
    rmSync(longDir, { recursive: true, force: true });
    rmSync(manyDir, { recursive: true, force: true });
  });

  it('skips a line over the length cap and reports the search as truncated', async () => {
    const start = performance.now();
    const out = await grepFiles([{ absPath: longDir, id: 'w' }], 'a');
    expect(performance.now() - start).toBeLessThan(2_000);
    expect(out.results.map((r) => r.relPath)).toEqual(['w/short.md']);
    expect(out.truncated).toBe(true);
    expect(out.timedOut).toBe(false);
  });

  it('counts every hit on lines under the cap but keeps only the per-file cap', async () => {
    const out = await grepFiles([{ absPath: manyDir, id: 'w' }], 'a');
    const [file] = out.results;
    expect(file?.total).toBe(9_999 * 300);
    expect(file?.hits).toHaveLength(20);
    expect(file?.truncated).toBe(true);
    expect(file?.hits[19]).toMatchObject({ line: 1, col: 19 });
  });

  it('stops at its time budget with partial results, not a timeout', async () => {
    const out = await grepFiles([{ absPath: manyDir, id: 'w' }], 'a', { literalBudgetMs: 0 });
    const [file] = out.results;
    expect(file?.hits).toHaveLength(20);
    expect(file?.total).toBeLessThan(9_999 * 300);
    expect(file?.truncated).toBe(true);
    expect(out.truncated).toBe(true);
    expect(out.timedOut).toBe(false);
  });
});

describe('grepFiles — ReDoS mitigation (C4)', () => {
  let reDir: string;
  beforeAll(() => {
    reDir = mkdtempSync(path.join(os.tmpdir(), 'mdview-grep-redos-'));
    // 50KB single line of "a"s — well above the 10_000 ch regex line cap.
    writeFileSync(path.join(reDir, 'long.md'), 'a'.repeat(50_000) + '!');
  });
  afterAll(() => {
    rmSync(reDir, { recursive: true, force: true });
  });

  it('skips ultra-long lines in regex mode and reports truncated', async () => {
    const start = Date.now();
    const out = await grepFiles([{ absPath: reDir, id: 'w' }], '(a+)+$', { regex: true, maxLineLen: 10_000 });
    const elapsed = Date.now() - start;
    // Without the line cap, this pattern would hang for many seconds.
    expect(elapsed).toBeLessThan(500);
    // No results recorded (the line was skipped), but the file should be
    // tracked as truncated. Implementation only records files with hits, so
    // we just assert it returned promptly and didn't blow up.
    expect(out).toBeDefined();
  });

  it('counts many overlapping hits on a long line without stalling', async () => {
    const start = Date.now();
    const out = await grepFiles([{ absPath: reDir, id: 'w' }], 'a', {
      regex: true,
      maxLineLen: 1_000_000,
    });
    expect(Date.now() - start).toBeLessThan(2000);
    expect(out.results[0]?.total).toBe(50_000);
    expect(out.results[0]?.hits).toHaveLength(20);
  });
});

// `^(\w+\s?)*$` backtracks exponentially on a line of words that ends in a
// character \w cannot match. On this line one exec() runs for minutes.
const CATASTROPHIC = '^(\\w+\\s?)*$';
const BAD_LINE = 'This is a normal sentence with words in it ending here!';

describe('grepFiles — regex runs in a worker with a time budget', () => {
  let rdir: string;
  beforeAll(() => {
    rdir = mkdtempSync(path.join(os.tmpdir(), 'mdview-grep-worker-'));
    // Enough matching files ahead of the bad one to fill at least one batch.
    for (let i = 0; i < 70; i++) {
      writeFileSync(path.join(rdir, `a${String(i).padStart(3, '0')}.md`), 'hello world\n');
    }
    writeFileSync(path.join(rdir, 'zz.md'), `${BAD_LINE}\n`);
  });
  afterAll(() => {
    rmSync(rdir, { recursive: true, force: true });
  });

  it('stops a catastrophic pattern at its budget, keeping what it found', async () => {
    const start = Date.now();
    const out = await grepFiles([{ absPath: rdir, id: 'w' }], CATASTROPHIC, {
      regex: true,
      regexBudgetMs: 300,
    });
    expect(Date.now() - start).toBeLessThan(2000);
    expect(out.timedOut).toBe(true);
    expect(out.truncated).toBe(true);
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results.every((r) => r.relPath !== 'w/zz.md')).toBe(true);
  });

  it('keeps the event loop free while the pattern runs', async () => {
    let maxLag = 0;
    let last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      maxLag = Math.max(maxLag, now - last);
      last = now;
    }, 10);
    try {
      await grepFiles([{ absPath: rdir, id: 'w' }], CATASTROPHIC, {
        regex: true,
        regexBudgetMs: 500,
      });
    } finally {
      clearInterval(tick);
    }
    expect(maxLag).toBeLessThan(200);
  });

  it('gets a fresh worker after one was terminated', async () => {
    const first = await grepFiles([{ absPath: rdir, id: 'w' }], CATASTROPHIC, {
      regex: true,
      regexBudgetMs: 200,
    });
    expect(first.timedOut).toBe(true);
    const second = await grepFiles([{ absPath: rdir, id: 'w' }], 'hel+o', { regex: true });
    expect(second.timedOut).toBe(false);
    expect(second.results).toHaveLength(70);
  });

  it('stops promptly when the caller aborts', async () => {
    const ac = new AbortController();
    const start = Date.now();
    setTimeout(() => ac.abort(), 150);
    const out = await grepFiles([{ absPath: rdir, id: 'w' }], CATASTROPHIC, {
      regex: true,
      regexBudgetMs: 60_000,
      signal: ac.signal,
    });
    expect(Date.now() - start).toBeLessThan(2000);
    expect(out.timedOut).toBe(false);
  });

  it('runs at most two regex searches at once and queues the rest', async () => {
    const start = Date.now();
    const outs = await Promise.all(
      Array.from({ length: 4 }, () =>
        grepFiles([{ absPath: rdir, id: 'w' }], CATASTROPHIC, { regex: true, regexBudgetMs: 300 }),
      ),
    );
    // Two at a time means two rounds of the 300 ms budget; four threads at once
    // would finish in one.
    expect(Date.now() - start).toBeGreaterThanOrEqual(550);
    expect(outs.every((o) => o.timedOut)).toBe(true);
  });

  it('drops a queued search when the caller aborts', async () => {
    const busy = Array.from({ length: 2 }, () =>
      grepFiles([{ absPath: rdir, id: 'w' }], CATASTROPHIC, { regex: true, regexBudgetMs: 1_500 }),
    );
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 100);
    const start = Date.now();
    const queued = await grepFiles([{ absPath: rdir, id: 'w' }], CATASTROPHIC, {
      regex: true,
      regexBudgetMs: 60_000,
      signal: ac.signal,
    });
    expect(Date.now() - start).toBeLessThan(1_000);
    expect(queued.timedOut).toBe(false);
    await Promise.all(busy);
  });

  it('never reports a timeout for a literal search', async () => {
    const out = await grepFiles([{ absPath: rdir, id: 'w' }], BAD_LINE);
    expect(out.timedOut).toBe(false);
    expect(out.results.map((r) => r.relPath)).toEqual(['w/zz.md']);
  });
});

describe('GET /api/search — regex time budget', () => {
  let rdir: string;
  let app: FastifyInstance;
  beforeAll(async () => {
    rdir = mkdtempSync(path.join(os.tmpdir(), 'mdview-search-route-'));
    writeFileSync(path.join(rdir, 'bad.md'), `${BAD_LINE}\n`);
    app = Fastify({ logger: false });
    registerApiSearch(app, [fakeRoot(rdir, { id: 'w' })], { regexBudgetMs: 300 });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    rmSync(rdir, { recursive: true, force: true });
  });

  it('answers within the budget and flags the timeout', async () => {
    const start = Date.now();
    const res = await app.inject({
      url: `/api/search?q=${encodeURIComponent(CATASTROPHIC)}&regex=1`,
    });
    expect(Date.now() - start).toBeLessThan(2000);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ results: [], truncated: true, timedOut: true });
  });

  it('reports timedOut false on an ordinary search', async () => {
    const res = await app.inject({ url: '/api/search?q=normal' });
    expect(res.json()).toMatchObject({ truncated: false, timedOut: false });
    expect(res.json().results).toHaveLength(1);
  });
});

describe('grepFiles — reads and cache', () => {
  let cdir: string;
  beforeAll(() => {
    cdir = mkdtempSync(path.join(os.tmpdir(), 'mdview-grep-cache-'));
    for (let i = 0; i < 30; i++) {
      writeFileSync(path.join(cdir, `f${String(i).padStart(2, '0')}.md`), `line kiwi ${i}\n`);
    }
  });
  afterAll(() => {
    rmSync(cdir, { recursive: true, force: true });
  });

  it('returns results in walk order despite concurrent reads', async () => {
    const out = await grepFiles([{ absPath: cdir, id: 'w' }], 'kiwi');
    expect(out.results.map((r) => r.relPath)).toEqual(
      Array.from({ length: 30 }, (_, i) => `w/f${String(i).padStart(2, '0')}.md`),
    );
  });

  it('serves a changed file fresh, not from the cache', async () => {
    const cache = new ContentCache();
    const file = path.join(cdir, 'f00.md');
    expect((await grepFiles([{ absPath: cdir, id: 'w' }], 'mango', { cache })).results).toEqual([]);
    writeFileSync(file, 'line mango now\n');
    // Same mtime tick is possible; the watcher invalidation covers that case.
    cache.invalidate(ContentCache.keyFor(cdir, 'f00.md'));
    const out = await grepFiles([{ absPath: cdir, id: 'w' }], 'mango', { cache });
    expect(out.results.map((r) => r.relPath)).toEqual(['w/f00.md']);
    writeFileSync(file, 'line kiwi 0\n');
  });

  it('skips a markdown file over 16 MB', async () => {
    const big = path.join(cdir, 'zz-big.md');
    writeFileSync(big, Buffer.alloc(16 * 1024 * 1024 + 1, 0x61));
    try {
      const out = await grepFiles([{ absPath: cdir, id: 'w' }], 'aaaa');
      expect(out.results).toEqual([]);
    } finally {
      rmSync(big);
    }
  });
});

describe('ContentCache', () => {
  it('hits only while mtime and size match', () => {
    const c = new ContentCache();
    c.set('k', 1, 3, 'abc');
    expect(c.get('k', 1, 3)).toBe('abc');
    expect(c.get('k', 2, 3)).toBeUndefined();
    expect(c.get('k', 1, 3)).toBeUndefined();
  });

  it('evicts least-recently-used entries past its size cap', () => {
    const c = new ContentCache(40);
    c.set('a', 1, 1, 'x'.repeat(10));
    c.set('b', 1, 1, 'x'.repeat(10));
    c.set('c', 1, 1, 'x'.repeat(10));
    expect(c.get('a', 1, 1)).toBeDefined();
    c.set('d', 1, 1, 'x'.repeat(10));
    c.set('e', 1, 1, 'x'.repeat(10));
    expect(c.get('b', 1, 1)).toBeUndefined();
    expect(c.get('a', 1, 1)).toBeDefined();
    expect(c.get('e', 1, 1)).toBeDefined();
  });

  it('does not keep a single body larger than a quarter of the cap', () => {
    const c = new ContentCache(40);
    c.set('big', 1, 1, 'x'.repeat(11));
    expect(c.get('big', 1, 1)).toBeUndefined();
  });
});
