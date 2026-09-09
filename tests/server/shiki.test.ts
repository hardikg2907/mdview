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

  it('emits a CSS variable per (palette, mode) pair', async () => {
    const html = await highlightCode('const x = 1;', 'ts');
    // Driven off PALETTES rather than a hand-written list: a palette added to
    // the allow-list without a matching entry in PALETTE_THEME_MAP would
    // otherwise render with no colour under that palette and pass silently.
    for (const palette of PALETTES) {
      for (const mode of ['light', 'dark']) {
        expect(html).toContain(`--shiki-${palette}-${mode}`);
      }
    }
    // Old single-mode names must NOT leak through.
    expect(html).not.toMatch(/--shiki-light\b/);
    expect(html).not.toMatch(/--shiki-dark\b/);
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
