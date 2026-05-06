import { describe, it, expect } from 'vitest';
import { highlightCode } from '../../src/server/render/shiki.js';

describe('highlightCode', () => {
  it('produces shiki-themed html for known language', async () => {
    const html = await highlightCode('const x = 1;', 'ts');
    expect(html).toContain('<pre');
    expect(html).toContain('class="shiki');
    // Dual-theme mode emits CSS variables; single-theme emits color:
    expect(html).toMatch(/style="[^"]*(?:color:|--shiki-)/);
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
