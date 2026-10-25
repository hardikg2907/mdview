import { describe, expect, it } from 'vitest';
import { rewriteTags, stripMetaAndBase } from '../../src/render/html-tags.js';

// Any `<meta` or `<base` an HTML parser would read as the start of that tag.
const META_OR_BASE = /<(?:meta|base)(?=[\t\n\f\r />]|$)/i;

describe('stripMetaAndBase', () => {
  it('returns a fragment without either tag unchanged', () => {
    const html = '<div class="x"><metadata/><basefont> text </div>\n';
    expect(stripMetaAndBase(html)).toBe(html);
  });

  it('removes the tag and keeps what surrounds it', () => {
    expect(stripMetaAndBase('<p>a<meta charset="utf-8">b</p>')).toBe('<p>ab</p>');
    expect(stripMetaAndBase('a<BASE\thref=x/>b')).toBe('ab');
  });

  it('reads a > inside a quoted value as part of the tag', () => {
    expect(stripMetaAndBase('<meta content="a>b" http-equiv=refresh>after')).toBe('after');
  });

  it('removes a tag inside another tag\'s attribute value too', () => {
    expect(stripMetaAndBase('<div title="<meta x>">')).not.toMatch(META_OR_BASE);
  });

  it('turns a < left hanging before a cut into text', () => {
    expect(stripMetaAndBase('<<meta x>meta y>')).toBe('&lt;meta y>');
    expect(stripMetaAndBase('<m<meta>e<base>ta y>')).toBe('&lt;meta y>');
  });

  it('never leaves a meta or base start tag, whatever the input', () => {
    // Small alphabet, whole tags included, so cuts land next to name pieces.
    const pieces = ['<', '>', '<meta>', '<base ', 'meta', 'base', 'me', 'ta', 'se', ' ', '/', '"', "'", '=x'];
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
      if (META_OR_BASE.test(out)) throw new Error(`left a tag in ${JSON.stringify(s)} -> ${JSON.stringify(out)}`);
    }
  });

  it('stays linear on many tags', () => {
    for (const unit of ['<meta>', '<<meta>', '<m<meta>e', '<meta ']) {
      const input = unit.repeat(200_000);
      const start = performance.now();
      const out = stripMetaAndBase(input);
      expect(performance.now() - start).toBeLessThan(1_000);
      expect(out).not.toMatch(META_OR_BASE);
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
