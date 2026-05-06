import { describe, it, expect } from 'vitest';
import { tagInternalLinks } from '../../src/server/render/links.js';

describe('tagInternalLinks', () => {
  it('marks relative md links as internal with data attribute', () => {
    const html = '<a href="other.md">x</a>';
    const out = tagInternalLinks(html, 'guides/intro.md');
    expect(out).toContain('data-internal-link="guides/other.md"');
  });

  it('preserves anchor on internal link', () => {
    const html = '<a href="other.md#section-2">x</a>';
    const out = tagInternalLinks(html, 'guides/intro.md');
    expect(out).toContain('data-internal-link="guides/other.md#section-2"');
  });

  it('leaves http(s) links alone', () => {
    const html = '<a href="https://example.com">x</a>';
    const out = tagInternalLinks(html, 'a.md');
    expect(out).not.toContain('data-internal-link');
  });

  it('leaves bare anchor links alone (same-doc nav)', () => {
    const html = '<a href="#heading">x</a>';
    const out = tagInternalLinks(html, 'a.md');
    expect(out).not.toContain('data-internal-link');
  });

  it('resolves ../ paths', () => {
    const html = '<a href="../top.md">x</a>';
    const out = tagInternalLinks(html, 'guides/intro.md');
    expect(out).toContain('data-internal-link="top.md"');
  });
});
