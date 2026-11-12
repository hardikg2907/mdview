import { describe, expect, it } from 'vitest';
import { rewriteTags, stripMetaAndBase } from '../../src/render/html-tags.js';

// Any `<meta`, `<base`, or `<link` an HTML parser would read as the start of that tag.
const STRIPPED_TAG = /<(?:meta|base|link)(?=[\t\n\f\r />]|$)/i;

describe('stripMetaAndBase', () => {
  it('returns a fragment without stripped tags unchanged', () => {
    const html = '<div class="x"><metadata/><basefont><linkedin> text </div>\n';
    expect(stripMetaAndBase(html)).toBe(html);
  });

  it('removes meta, base, and link tags and keeps what surrounds them', () => {
    expect(stripMetaAndBase('<p>a<meta charset="utf-8">b</p>')).toBe('<p>ab</p>');
    expect(stripMetaAndBase('a<BASE\thref=x/>b')).toBe('ab');
    expect(stripMetaAndBase('a<link rel="dns-prefetch" href="//example.invalid">b')).toBe('ab');
    expect(stripMetaAndBase('a<LINK rel="preconnect" href="https://example.invalid"/>b')).toBe('ab');
  });

  it('reads a > inside a quoted value as part of the tag', () => {
    expect(stripMetaAndBase('<meta content="a>b" http-equiv=refresh>after')).toBe('after');
  });

  it("removes a tag inside another tag's attribute value too", () => {
    expect(stripMetaAndBase('<div title="<meta x>">')).not.toMatch(STRIPPED_TAG);
    expect(stripMetaAndBase('<div title="<link rel=preconnect>">')).not.toMatch(STRIPPED_TAG);
  });

  it('turns a < left hanging before a cut into text', () => {
    expect(stripMetaAndBase('<<meta x>meta y>')).toBe('&lt;meta y>');
    expect(stripMetaAndBase('<m<meta>e<base>ta y>')).toBe('&lt;meta y>');
    expect(stripMetaAndBase('<li<meta>nk rel=preconnect>')).toBe('&lt;link rel=preconnect>');
  });

  it('never leaves a meta, base, or link start tag, whatever the input', () => {
    // Small alphabet, whole tags included, so cuts land next to name pieces.
    const pieces = [
      '<',
      '>',
      '<meta>',
      '<base ',
      '<link ',
      'meta',
      'base',
      'link',
      'me',
      'ta',
      'se',
      'li',
      'nk',
      ' ',
      '/',
      '"',
      "'",
      '=x',
    ];
    let seed = 1;
    const rand = (n: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return (seed >>> 8) % n;
    };
    for (let round = 0; round < 50_000; round++) {
      let s = '';
      const len = 1 + rand(24);
      for (let k = 0; k < len; k++) s += pieces[rand(pieces.length)];
      const out = stripMetaAndBase(s);
      if (STRIPPED_TAG.test(out)) {
        throw new Error(`left a tag in ${JSON.stringify(s)} -> ${JSON.stringify(out)}`);
      }
    }
  });

  it('stays linear on many tags', () => {
    for (const unit of ['<meta>', '<<meta>', '<m<meta>e', '<meta ', '<link ', '<li<link>nk ']) {
      const input = unit.repeat(200_000);
      const start = performance.now();
      const out = stripMetaAndBase(input);
      expect(performance.now() - start).toBeLessThan(1_000);
      expect(out).not.toMatch(STRIPPED_TAG);
    }
  });
});

describe('rewriteTags', () => {
  it('hands each wanted start tag its lower-cased attributes and spans', () => {
    const html = '<p><IMG Src="a.png" alt=\'x\' hidden>';
    const seen: unknown[] = [];
    rewriteTags(html, new Set(['img']), (tag) => {
      seen.push({
        name: tag.name,
        text: html.slice(tag.start, tag.end),
        attrs: tag.attrs.map((a) => [a.name, a.value, html.slice(a.start, a.end)]),
      });
      return null;
    });
    expect(seen).toEqual([
      {
        name: 'img',
        text: '<IMG Src="a.png" alt=\'x\' hidden>',
        attrs: [
          ['src', 'a.png', 'Src="a.png"'],
          ['alt', 'x', "alt='x'"],
          ['hidden', null, 'hidden'],
        ],
      },
    ]);
  });

  it('steps over end tags, declarations and processing instructions', () => {
    const html = '<!DOCTYPE html><?xml x?></a title=">"><a href=x>';
    const names: string[] = [];
    rewriteTags(html, new Set(['a']), (tag) => {
      names.push(html.slice(tag.start, tag.end));
      return null;
    });
    expect(names).toEqual(['<a href=x>']);
  });
});
