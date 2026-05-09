import { describe, it, expect } from 'vitest';
import {
  countHeadings,
  formatStats,
  computeDocStats,
} from '../../src/client/lib/doc-stats.js';
import type { OutlineNode } from '../../src/shared/types.js';

const h = (id: string, level: 1 | 2 | 3, children: OutlineNode[] = []): OutlineNode => ({
  id,
  text: id,
  level,
  children,
});

describe('countHeadings', () => {
  it('returns 0 for an empty outline', () => {
    expect(countHeadings([])).toBe(0);
  });

  it('counts a flat list', () => {
    expect(countHeadings([h('a', 1), h('b', 1), h('c', 1)])).toBe(3);
  });

  it('counts nested headings recursively', () => {
    const tree = [
      h('a', 1, [h('a1', 2, [h('a1a', 3)]), h('a2', 2)]),
      h('b', 1),
    ];
    // a, a1, a1a, a2, b => 5
    expect(countHeadings(tree)).toBe(5);
  });
});

describe('formatStats', () => {
  it('singularizes word and heading when count is 1', () => {
    expect(formatStats({ words: 1, readingMinutes: 1, headings: 1 })).toBe(
      '1 min read · 1 word · 1 heading',
    );
  });

  it('pluralizes word and heading when count is not 1', () => {
    expect(formatStats({ words: 2, readingMinutes: 1, headings: 0 })).toBe(
      '1 min read · 2 words · 0 headings',
    );
  });

  it('uses locale grouping for large word counts', () => {
    const out = formatStats({ words: 12345, readingMinutes: 55, headings: 4 });
    expect(out).toContain('55 min read');
    expect(out).toContain('4 headings');
    // 12,345 in en-US, 12.345 in de-DE — accept any non-digit grouping char.
    expect(out).toMatch(/12[^\d]?345 words/);
  });
});

describe('computeDocStats', () => {
  it('counts words from rendered text content (DOM-stripped)', () => {
    const html = '<p>Hello <strong>world</strong> from <em>tests</em>.</p>';
    const stats = computeDocStats(html, []);
    expect(stats.words).toBe(4);
  });

  it('returns zero words for empty/whitespace HTML', () => {
    expect(computeDocStats('', []).words).toBe(0);
    expect(computeDocStats('<p>   </p>', []).words).toBe(0);
  });

  it('always returns at least one reading minute', () => {
    const stats = computeDocStats('<p>hi</p>', []);
    expect(stats.readingMinutes).toBeGreaterThanOrEqual(1);
  });

  it('headings count comes from the outline, not the HTML', () => {
    const html = '<h1>not counted</h1>';
    const stats = computeDocStats(html, [h('a', 1, [h('a1', 2)])]);
    expect(stats.headings).toBe(2);
  });
});
