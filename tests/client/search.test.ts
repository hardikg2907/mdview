import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearHighlights,
  findHits,
  highlightHits,
  type SearchHit,
  setActiveMark,
} from '../../src/client/lib/search.js';

function setup(contentHtml: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `<div class="markdown-content">${contentHtml}</div>`;
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// findHits walks the DOM with TreeWalker, which happy-dom does not implement
// fully (the SHOW_TEXT mask is not honored). We test the no-op edge cases here
// and rely on the underlying compilePattern tests in search-pattern.test.ts for
// match-engine semantics.
describe('findHits — short-circuits', () => {
  it('returns [] for an empty query without touching the DOM', () => {
    const root = setup('<p>hello</p>');
    expect(findHits(root, '')).toEqual([]);
  });

  it('returns [] for an invalid regex', () => {
    const root = setup('<p>hello</p>');
    const hits = findHits(root, '[unterminated', {
      caseSensitive: false,
      wholeWord: false,
      regex: true,
    });
    expect(hits).toEqual([]);
  });
});

function makeHits(textNode: Text, ranges: Array<[number, number]>): SearchHit[] {
  return ranges.map(([start, end]) => ({ node: textNode, start, end }));
}

describe('highlightHits', () => {
  it('wraps each match in <mark.search-hit> in document order', () => {
    const root = setup('<p>hello world hello</p>');
    const text = root.querySelector('p')!.firstChild as Text;
    const hits = makeHits(text, [[0, 5], [12, 17]]);

    const marks = highlightHits(hits, 0);
    expect(marks.length).toBe(2);
    marks.forEach((m) => {
      expect(m.tagName).toBe('MARK');
      expect(m.classList.contains('search-hit')).toBe(true);
    });

    const inDom = root.querySelectorAll('mark.search-hit');
    expect(Array.from(inDom).map((m) => m.textContent)).toEqual(['hello', 'hello']);
  });

  it('records the hit index on each mark via data-hit', () => {
    const root = setup('<p>aa aa</p>');
    const text = root.querySelector('p')!.firstChild as Text;
    const hits = makeHits(text, [[0, 2], [3, 5]]);
    highlightHits(hits, 1);

    const marks = root.querySelectorAll<HTMLElement>('mark.search-hit');
    expect(Array.from(marks).map((m) => m.dataset.hit)).toEqual(['0', '1']);
  });

  it('marks the active hit with .is-active', () => {
    const root = setup('<p>aa aa aa</p>');
    const text = root.querySelector('p')!.firstChild as Text;
    const hits = makeHits(text, [[0, 2], [3, 5], [6, 8]]);
    highlightHits(hits, 2);

    const active = root.querySelectorAll('mark.is-active');
    expect(active.length).toBe(1);
    expect((active[0] as HTMLElement).dataset.hit).toBe('2');
  });

  it('preserves text outside the matched ranges', () => {
    const root = setup('<p>before MATCH after</p>');
    const text = root.querySelector('p')!.firstChild as Text;
    const hits = makeHits(text, [[7, 12]]);
    highlightHits(hits, 0);

    expect(root.textContent).toBe('before MATCH after');
  });

  it('handles multiple text nodes independently', () => {
    const root = setup('<p>first</p><p>second</p>');
    const t1 = root.querySelectorAll('p')[0]!.firstChild as Text;
    const t2 = root.querySelectorAll('p')[1]!.firstChild as Text;
    const hits = [...makeHits(t1, [[0, 5]]), ...makeHits(t2, [[0, 6]])];
    highlightHits(hits, 0);

    const marks = root.querySelectorAll('mark.search-hit');
    expect(marks.length).toBe(2);
    expect(marks[0]!.textContent).toBe('first');
    expect(marks[1]!.textContent).toBe('second');
  });
});

describe('setActiveMark', () => {
  it('moves .is-active to the new active index', () => {
    const root = setup('<p>aa aa aa</p>');
    const text = root.querySelector('p')!.firstChild as Text;
    highlightHits(makeHits(text, [[0, 2], [3, 5], [6, 8]]), 0);

    const active = setActiveMark(root, 1);
    expect(active).not.toBeNull();
    expect(active!.dataset.hit).toBe('1');
    const allActive = root.querySelectorAll('mark.is-active');
    expect(allActive.length).toBe(1);
  });

  it('returns null when no mark matches the active index', () => {
    const root = setup('<p>aa</p>');
    const text = root.querySelector('p')!.firstChild as Text;
    highlightHits(makeHits(text, [[0, 2]]), 0);

    expect(setActiveMark(root, 99)).toBeNull();
  });
});

describe('clearHighlights', () => {
  it('removes <mark> wrappers and restores the original text', () => {
    const root = setup('<p>hello world</p>');
    const text = root.querySelector('p')!.firstChild as Text;
    highlightHits(makeHits(text, [[0, 5]]), 0);
    expect(root.querySelectorAll('mark.search-hit').length).toBe(1);

    clearHighlights(root);
    expect(root.querySelectorAll('mark.search-hit').length).toBe(0);
    expect(root.textContent).toBe('hello world');
  });

  it('is safe to call when no highlights exist', () => {
    const root = setup('<p>nothing</p>');
    expect(() => clearHighlights(root)).not.toThrow();
    expect(root.textContent).toBe('nothing');
  });
});
