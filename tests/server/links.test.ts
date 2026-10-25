import { describe, expect, it } from 'vitest';
import { rewriteImageSrc, tagInternalLinks } from '../../src/render/links.js';
import { renderMarkdown } from '../../src/render/markdown.js';

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

  it('cannot break out of data-internal-link with a percent-encoded quote', () => {
    const html = '<a href="x%22%20onmouseover%3D%22alert(1)%22%20a%3D%22.md">x</a>';
    const out = tagInternalLinks(html, 'a.md');
    expect(out).not.toMatch(/"\s+onmouseover=/);
    expect(out).toContain(
      'data-internal-link="x&quot; onmouseover=&quot;alert(1)&quot; a=&quot;.md"',
    );
  });

  it('escapes < > and quotes decoded from the path', () => {
    const html = '<a href="%3Cimg%20src%3Dx%3E%27.md">x</a>';
    const out = tagInternalLinks(html, 'a.md');
    expect(out).not.toContain('<img');
    expect(out).toContain('data-internal-link="&lt;img src=x&gt;&#39;.md"');
  });

  it('round-trips an escaped & in the query without double-escaping', () => {
    const html = '<a href="other.md?a=1&amp;b=2">x</a>';
    const out = tagInternalLinks(html, 'a.md');
    expect(out).toContain('data-internal-link="other.md?a=1&amp;b=2"');
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

  it('keeps a self-closing slash and the other attributes in place', () => {
    const out = rewriteImageSrc('<img alt="d" src="x.png" width="10" />', 'g/a.md');
    expect(out).toBe('<img alt="d" src="/__asset/g/x.png" width="10" />');
  });

  it('rewrites single-quoted and unquoted raw HTML sources', () => {
    expect(rewriteImageSrc("<IMG SRC='x.png'>", 'a.md')).toBe('<IMG src="/__asset/x.png">');
    expect(rewriteImageSrc('<img src=x.png>', 'a.md')).toBe('<img src="/__asset/x.png">');
  });

  it('cannot break out of src with a quote from a single-quoted source', () => {
    const out = rewriteImageSrc(`<img src='x".png'>`, 'a.md');
    expect(out).toBe('<img src="/__asset/x&quot;.png">');
  });
});

describe('raw HTML scanning', () => {
  it('reads a > inside a quoted attribute as part of the value', () => {
    const out = tagInternalLinks('<a title="x>y" href="b.md">t</a>', 'a.md');
    expect(out).toBe('<a title="x>y" href="?file=b.md" data-internal-link="b.md">t</a>');
  });

  it('escapes a single-quoted href on the way out', () => {
    const out = tagInternalLinks(`<a href='b".md'>t</a>`, 'a.md');
    expect(out).toContain('data-internal-link="b&quot;.md"');
  });

  it('matches tag and attribute names case-insensitively', () => {
    const out = tagInternalLinks('<A HREF="b.md">t</A>', 'a.md');
    expect(out).toBe('<A href="?file=b.md" data-internal-link="b.md">t</A>');
  });

  it('only treats an attribute named exactly href as the link target', () => {
    const html = '<a data-href="b.md">t</a>';
    expect(tagInternalLinks(html, 'a.md')).toBe(html);
  });

  it('leaves links inside comments and attribute values alone', () => {
    const html = '<!-- <a href="b.md"> --><div title=\'<a href="c.md">\'></div>';
    expect(tagInternalLinks(html, 'a.md')).toBe(html);
  });

  it('passes an unterminated tag through untouched', () => {
    const html = '<a href="b.md">ok</a><a title="never closed href="c.md">';
    expect(tagInternalLinks(html, 'a.md')).toBe(
      '<a href="?file=b.md" data-internal-link="b.md">ok</a><a title="never closed href="c.md">',
    );
  });
});

describe('link and image rewriting stays linear on adversarial HTML', () => {
  // One raw HTML block of tags that never close. A backtracking regex over
  // the whole document restarts at every `<a`: 1 MB took close to a minute.
  const shapes: Record<string, string> = {
    'open anchors': '<a ',
    'open images': '<img ',
    'anchors with attributes': '<a title="x" ',
    'closed anchors without href': '<a x>',
    'internal links': '<a href="x.md">x</a> ',
    'open comments': '<!-- ',
  };

  async function timeRender(unit: string, bytes: number): Promise<number> {
    const md = `<div>\n${unit.repeat(Math.ceil(bytes / unit.length))}\n`;
    let best = Number.POSITIVE_INFINITY;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      const { html } = await renderMarkdown(md);
      rewriteImageSrc(tagInternalLinks(html, 'r/doc.md'), 'r/doc.md');
      best = Math.min(best, performance.now() - start);
    }
    return best;
  }

  it.each(Object.entries(shapes))('%s: 1 MB renders well under a second', async (_name, unit) => {
    const small = await timeRender(unit, 250_000);
    const large = await timeRender(unit, 1_000_000);
    expect(large).toBeLessThan(2_000);
    // 4x the input is 16x the time when quadratic. The floor absorbs timer
    // noise on runs that finish in a few milliseconds.
    expect(large).toBeLessThan(Math.max(small * 8, 250));
  });
});
