import { describe, it, expect } from 'vitest';
import { highlightCode } from '../../src/render/shiki.js';

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
    // One variable per palette/mode combo lands on each token's style attr.
    // We only need to confirm representative entries to lock the multi-theme
    // contract — exhaustive enumeration would just couple to Shiki's output.
    for (const v of [
      '--shiki-classic-light',
      '--shiki-classic-dark',
      '--shiki-paper-light',
      '--shiki-paper-dark',
      '--shiki-nord-light',
      '--shiki-nord-dark',
      '--shiki-solarized-light',
      '--shiki-solarized-dark',
      '--shiki-high-contrast-light',
      '--shiki-high-contrast-dark',
    ]) {
      expect(html).toContain(v);
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
