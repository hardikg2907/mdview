import { describe, expect, it } from 'vitest';
import { highlightCache, highlightCode, warmHighlighter } from '../../src/render/shiki.js';
import { PALETTES } from '../../src/shared/types.js';

describe('highlight cache', () => {
  it('serves a repeat of the same block from the cache', async () => {
    const code = `const cacheHit = ${Math.random()};`;
    const first = await highlightCode(code, 'ts', 'solarized');
    const before = highlightCache.stats();
    const second = await highlightCode(code, 'ts', 'solarized');
    const after = highlightCache.stats();
    expect(second).toBe(first);
    expect(after.hits).toBe(before.hits + 1);
    expect(after.misses).toBe(before.misses);
    expect(after.entries).toBe(before.entries);
  });

  it('misses on the first sight of a block and stores it', async () => {
    const before = highlightCache.stats();
    await highlightCode(`const cacheMiss = ${Math.random()};`, 'ts');
    const after = highlightCache.stats();
    expect(after.misses).toBe(before.misses + 1);
    expect(after.entries).toBe(before.entries + 1);
    expect(after.bytes).toBeGreaterThan(before.bytes);
  });

  it('keeps palettes apart: the same code under another palette is a miss', async () => {
    const code = `const paletteSplit = ${Math.random()};`;
    const everforest = await highlightCode(code, 'ts', 'everforest');
    const before = highlightCache.stats();
    const catppuccin = await highlightCode(code, 'ts', 'catppuccin');
    expect(highlightCache.stats().misses).toBe(before.misses + 1);
    expect(catppuccin).not.toEqual(everforest);
    expect(await highlightCode(code, 'ts', 'everforest')).toBe(everforest);
  });

  it('keeps languages apart: the same code under another language is a miss', async () => {
    const code = `plain ${Math.random()}`;
    await highlightCode(code, 'ts');
    const before = highlightCache.stats();
    await highlightCode(code, 'python');
    expect(highlightCache.stats().misses).toBe(before.misses + 1);
  });

  it('stays within its byte budget however much is highlighted', async () => {
    // Plain text keeps tokenising cheap; only the size of the output matters here.
    const line = `${'x'.repeat(200)}\n`;
    for (let i = 0; i < 120; i++) {
      await highlightCode(`${line.repeat(400)}${i}`, 'text');
    }
    const { bytes, entries } = highlightCache.stats();
    expect(bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(entries).toBeGreaterThan(0);
  });
});

describe('warmHighlighter', () => {
  it('resolves and leaves the highlighter usable', async () => {
    await expect(warmHighlighter()).resolves.toBeUndefined();
    expect(await highlightCode('1', 'json')).toContain('<pre');
  });
});

describe('highlightCode', () => {
  it('produces shiki-themed html for known language', async () => {
    const html = await highlightCode('const x = 1;', 'ts');
    expect(html).toContain('<pre');
    expect(html).toContain('class="shiki');
    // Multi-theme mode emits CSS variables; single-theme emits color:
    expect(html).toMatch(/style="[^"]*(?:color:|--shiki-)/);
  });

  it('emits one CSS variable per mode, for the requested palette only', async () => {
    const html = await highlightCode('const x = 1;', 'ts');
    // Both modes ship so the light/dark toggle repaints with no refetch.
    expect(html).toContain('--shiki-light');
    expect(html).toContain('--shiki-dark');
    // Palette-scoped names are what the old render-every-palette scheme
    // emitted; their return would mean the payload regression is back.
    for (const palette of PALETTES) {
      expect(html).not.toContain(`--shiki-${palette}-light`);
      expect(html).not.toContain(`--shiki-${palette}-dark`);
    }
  });

  it('colours a token differently per palette', async () => {
    // Guards the wiring end to end: if the palette argument were dropped on
    // the way to Shiki, every palette would render identical bytes.
    const [a, b] = await Promise.all([
      highlightCode('const x = 1;', 'ts', 'everforest'),
      highlightCode('const x = 1;', 'ts', 'catppuccin'),
    ]);
    expect(a).not.toEqual(b);
  });

  it('renders every palette in the allow-list', async () => {
    // A palette missing from PALETTE_THEMES would throw or silently emit no
    // colour; this fails on the first one that does.
    for (const palette of PALETTES) {
      const html = await highlightCode('const x = 1;', 'ts', palette);
      expect(html).toContain('--shiki-light');
    }
  });

  it('falls back gracefully for unknown language', async () => {
    const html = await highlightCode('hello', 'definitely-not-a-language');
    expect(html).toContain('<pre');
    expect(html).toContain('hello');
  });

  it('escapes html in code content', async () => {
    const html = await highlightCode('<script>alert(1)</script>', 'html');
    expect(html).not.toContain('<script>alert(1)</script>');
    // No executable script tag should survive (regardless of escape entity used).
    expect(html).not.toMatch(/<script[\s>]/i);
  });
});
