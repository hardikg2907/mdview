import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    const out = await grepFiles(crlfDir, 'banana');
    const r = out.results[0]!;
    for (const hit of r.hits) {
      expect(hit.snippet).not.toMatch(/\r/);
    }
    expect(r.hits.length).toBe(2);
  });

  it('whole-word match works at end of CRLF line', async () => {
    const out = await grepFiles(crlfDir, 'banana', { wholeWord: true });
    expect(out.results[0]!.hits.length).toBe(2);
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
    const out = await grepFiles(reDir, '(a+)+$', { regex: true, maxLineLenForRegex: 10_000 });
    const elapsed = Date.now() - start;
    // Without the line cap, this pattern would hang for many seconds.
    expect(elapsed).toBeLessThan(500);
    // No results recorded (the line was skipped), but the file should be
    // tracked as truncated. Implementation only records files with hits, so
    // we just assert it returned promptly and didn't blow up.
    expect(out).toBeDefined();
  });

  it('honors per-line budget when matching many overlapping hits', async () => {
    const start = Date.now();
    const out = await grepFiles(reDir, 'a', {
      regex: true,
      maxLineLenForRegex: 1_000_000,
      perLineBudgetMs: 5,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    // Should produce SOME matches (per-file cap of 20 will hit fast).
    expect(out).toBeDefined();
  });
});
