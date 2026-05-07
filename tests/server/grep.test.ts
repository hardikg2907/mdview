import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { grepFiles } from '../../src/server/fs/grep.js';

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
    const out = await grepFiles(dir, '');
    expect(out.results).toEqual([]);
  });

  it('finds case-insensitive matches across multiple files', async () => {
    const out = await grepFiles(dir, 'banana');
    expect(out.results.length).toBe(2);
    const aRes = out.results.find((r) => r.relPath === 'a.md');
    expect(aRes?.hits.length).toBe(2);
    const cRes = out.results.find((r) => r.relPath === 'sub/c.md');
    expect(cRes?.hits.length).toBe(3);
  });

  it('skips non-markdown files', async () => {
    const out = await grepFiles(dir, 'banana');
    expect(out.results.find((r) => r.relPath === 'ignore.txt')).toBeUndefined();
  });

  it('snippet contains the matched substring', async () => {
    const out = await grepFiles(dir, 'banana');
    const aRes = out.results.find((r) => r.relPath === 'a.md');
    const firstHit = aRes!.hits[0]!;
    const matched = firstHit.snippet.slice(firstHit.highlight[0], firstHit.highlight[1]);
    expect(matched.toLowerCase()).toBe('banana');
  });

  it('respects per-file cap', async () => {
    const out = await grepFiles(dir, 'banana', { perFileCap: 2 });
    const cRes = out.results.find((r) => r.relPath === 'sub/c.md');
    expect(cRes?.hits.length).toBe(2);
    expect(cRes?.truncated).toBe(true);
    expect(cRes?.total).toBe(3);
  });

  it('respects global cap', async () => {
    const out = await grepFiles(dir, 'banana', { globalCap: 2 });
    const totalHits = out.results.reduce((n, r) => n + r.hits.length, 0);
    expect(totalHits).toBeLessThanOrEqual(2);
    expect(out.truncated).toBe(true);
  });

  it('records 1-indexed line numbers', async () => {
    const out = await grepFiles(dir, 'banana');
    const aRes = out.results.find((r) => r.relPath === 'a.md');
    // a.md body (after frontmatter strip) is the same source, so:
    // line 1 "# Hello", line 2 blank, line 3 "First paragraph mentions banana."
    expect(aRes?.hits[0]?.line).toBe(3);
  });
});
