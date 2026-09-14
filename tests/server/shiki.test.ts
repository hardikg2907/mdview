import { describe, expect, it } from 'vitest';
import { highlightCode } from '../../src/render/shiki.js';
import { PALETTES } from '../../src/shared/types.js';

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
