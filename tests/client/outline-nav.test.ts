import { describe, expect, it } from 'vitest';
import {
  flattenHeadings,
  nextSameLevelHeading,
} from '../../src/client/lib/outline-nav.js';
import type { OutlineNode } from '../../src/shared/types.js';

function leaf(id: string, level: 1 | 2 | 3 | 4 | 5 | 6, children: OutlineNode[] = []): OutlineNode {
  return { id, text: id, level, children };
}

describe('flattenHeadings', () => {
  it('flattens nested outline preserving order', () => {
    const tree: OutlineNode[] = [
      leaf('a', 1, [leaf('b', 2), leaf('c', 2, [leaf('d', 3)])]),
      leaf('e', 1),
    ];
    expect(flattenHeadings(tree).map((h) => h.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('nextSameLevelHeading', () => {
  const tree: OutlineNode[] = [
    leaf('a', 1, [leaf('a1', 2), leaf('a2', 2, [leaf('a2x', 3)])]),
    leaf('b', 1, [leaf('b1', 2)]),
    leaf('c', 1),
  ];

  it('walks forward to next same-level sibling', () => {
    expect(nextSameLevelHeading(tree, 'a', 1)).toBe('b');
    expect(nextSameLevelHeading(tree, 'b', 1)).toBe('c');
  });

  it('walks backward to previous same-level sibling', () => {
    expect(nextSameLevelHeading(tree, 'c', -1)).toBe('b');
    expect(nextSameLevelHeading(tree, 'a2', -1)).toBe('a1');
  });

  it('returns null when none found', () => {
    expect(nextSameLevelHeading(tree, 'c', 1)).toBeNull();
    expect(nextSameLevelHeading(tree, 'a', -1)).toBeNull();
  });

  it('skips deeper or shallower headings', () => {
    expect(nextSameLevelHeading(tree, 'a1', 1)).toBe('a2');
    expect(nextSameLevelHeading(tree, 'a2', 1)).toBe('b1');
  });

  it('returns first/last when no active id', () => {
    expect(nextSameLevelHeading(tree, null, 1)).toBe('a');
    expect(nextSameLevelHeading(tree, null, -1)).toBe('c');
  });

  it('returns null for empty outline', () => {
    expect(nextSameLevelHeading([], 'a', 1)).toBeNull();
  });

  it('returns null when currentId not in outline', () => {
    expect(nextSameLevelHeading(tree, 'unknown', 1)).toBeNull();
  });
});
