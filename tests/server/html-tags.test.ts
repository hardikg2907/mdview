import { describe, expect, it } from 'vitest';
import { rewriteTags } from '../../src/render/html-tags.js';

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
