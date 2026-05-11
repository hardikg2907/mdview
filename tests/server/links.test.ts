import { describe, it, expect } from 'vitest';
import { tagInternalLinks, rewriteImageSrc } from '../../src/render/links.js';

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

  it('preserves a query string on internal links', () => {
    const html = '<a href="other.md?v=2">x</a>';
    const out = tagInternalLinks(html, 'guides/intro.md');
    expect(out).toContain('data-internal-link="guides/other.md?v=2"');
  });

  it('leaves mailto: links alone', () => {
    const html = '<a href="mailto:hi@example.com">x</a>';
    const out = tagInternalLinks(html, 'a.md');
    expect(out).not.toContain('data-internal-link');
  });

  it('leaves non-md links alone', () => {
    const html = '<a href="other.txt">x</a>';
    const out = tagInternalLinks(html, 'a.md');
    expect(out).not.toContain('data-internal-link');
  });

  it('decodes percent-encoded paths in data-internal-link so the router does not double-encode', () => {
    const html = '<a href="foo%20bar.md">x</a>';
    const out = tagInternalLinks(html, 'guides/intro.md');
    expect(out).toContain('data-internal-link="guides/foo bar.md"');
  });

  it('keeps the literal target when percent-encoding is malformed', () => {
    const html = '<a href="bad%2.md">x</a>';
    const out = tagInternalLinks(html, 'a.md');
    expect(out).toContain('data-internal-link="bad%2.md"');
  });

  it('rewrites href to ?file= so cmd/ctrl+click opens the SPA entrypoint directly', () => {
    const html = '<a href="other.md">x</a>';
    const out = tagInternalLinks(html, 'guides/intro.md');
    expect(out).toContain('href="?file=guides%2Fother.md"');
  });

  it('preserves the anchor hash on the rewritten ?file= href', () => {
    const html = '<a href="other.md#section-2">x</a>';
    const out = tagInternalLinks(html, 'guides/intro.md');
    expect(out).toContain('href="?file=guides%2Fother.md#section-2"');
  });
});

describe('rewriteImageSrc', () => {
  it('rewrites a relative image to /__asset/<resolved>', () => {
    const html = '<img src="diagram.png" alt="">';
    const out = rewriteImageSrc(html, 'guides/intro.md');
    expect(out).toContain('src="/__asset/guides/diagram.png"');
  });

  it('resolves ../ in image paths', () => {
    const html = '<img src="../assets/x.png" alt="">';
    const out = rewriteImageSrc(html, 'guides/intro.md');
    expect(out).toContain('src="/__asset/assets/x.png"');
  });

  it('strips a leading slash before resolving against the doc directory', () => {
    const html = '<img src="/img/logo.png" alt="">';
    const out = rewriteImageSrc(html, 'guides/intro.md');
    expect(out).toContain('src="/__asset/guides/img/logo.png"');
  });

  it('leaves http(s) URLs untouched', () => {
    const html = '<img src="https://example.com/x.png" alt="">';
    const out = rewriteImageSrc(html, 'a.md');
    expect(out).toBe(html);
  });

  it('leaves data: URLs untouched', () => {
    const html = '<img src="data:image/png;base64,AAA" alt="">';
    const out = rewriteImageSrc(html, 'a.md');
    expect(out).toBe(html);
  });

  it('does not double-rewrite already-rewritten /__asset/ srcs', () => {
    const html = '<img src="/__asset/guides/x.png" alt="">';
    const out = rewriteImageSrc(html, 'guides/intro.md');
    expect(out).toBe(html);
  });

  it('refuses to escape the root via ../ traversal', () => {
    const html = '<img src="../../../etc/passwd" alt="">';
    const out = rewriteImageSrc(html, 'a.md');
    // Resolved relPath would start with ".." — left untouched.
    expect(out).not.toContain('/__asset/');
  });
});
