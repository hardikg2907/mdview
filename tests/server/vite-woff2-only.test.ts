import { describe, expect, it } from 'vitest';
import { keepWoff2InCss, woff2OnlyFonts, woff2Sources } from '../../build/vite-woff2-only.js';

describe('woff2Sources', () => {
  it('keeps only the woff2 entry', () => {
    const value =
      'url(./a.woff2) format("woff2"), url(./a.woff) format("woff"), url(./a.ttf) format("truetype")';
    expect(woff2Sources(value)).toBe('url(./a.woff2) format("woff2")');
  });

  it('handles single quotes and no spaces around commas', () => {
    expect(woff2Sources("url(a.woff2) format('woff2'),url(a.woff) format('woff')")).toBe(
      "url(a.woff2) format('woff2')",
    );
  });

  it('does not split on a comma inside url()', () => {
    const value = 'url(data:font/woff2;base64,AAAA) format("woff2"), url(b.woff) format("woff")';
    expect(woff2Sources(value)).toBe('url(data:font/woff2;base64,AAAA) format("woff2")');
  });

  it('returns a list without any woff2 entry unchanged', () => {
    const value = 'url(a.woff) format("woff"), url(a.ttf) format("truetype")';
    expect(woff2Sources(value)).toBe(value);
  });
});

describe('keepWoff2InCss', () => {
  it('rewrites every @font-face and leaves descriptors and other rules alone', () => {
    const css = [
      '@font-face {',
      "  font-family: 'JetBrains Mono';",
      '  font-display: swap;',
      '  font-weight: 400;',
      '  src: url(./files/x-400.woff2) format(\'woff2\'), url(./files/x-400.woff) format(\'woff\');',
      '  unicode-range: U+0000-00FF,U+0131;',
      '}',
      '.a{src:url(keep.woff) format("woff")}',
      '@font-face{font-family:K;font-style:normal;src:url(k.woff2) format("woff2"),url(k.woff) format("woff"),url(k.ttf) format("truetype")}',
    ].join('\n');
    const out = keepWoff2InCss(css);
    expect(out).toContain("src: url(./files/x-400.woff2) format('woff2');");
    expect(out).toContain('font-display: swap;');
    expect(out).toContain('unicode-range: U+0000-00FF,U+0131;');
    expect(out).toContain('src:url(k.woff2) format("woff2")}');
    expect(out).not.toContain('x-400.woff)');
    expect(out).not.toContain('k.ttf');
    // Only @font-face blocks are touched.
    expect(out).toContain('.a{src:url(keep.woff) format("woff")}');
  });
});

describe('woff2OnlyFonts plugin', () => {
  const transform = (code: string, id: string) =>
    (woff2OnlyFonts().transform as (c: string, i: string) => unknown).call({}, code, id);

  it('transforms css modules, including ?url imports', () => {
    const css = '@font-face{src:url(a.woff2) format("woff2"),url(a.ttf) format("truetype")}';
    expect(transform(css, '/x/katex.min.css')).toEqual({
      code: '@font-face{src:url(a.woff2) format("woff2")}',
      map: null,
    });
    expect(transform(css, '/x/katex.min.css?url')).not.toBeNull();
  });

  it('skips non-css modules and css with nothing to drop', () => {
    expect(transform('@font-face{src:url(a.woff2) format("woff2")}', '/x/a.css')).toBeNull();
    expect(transform('@font-face{src:url(a.ttf) format("truetype")}', '/x/a.js')).toBeNull();
  });
});
