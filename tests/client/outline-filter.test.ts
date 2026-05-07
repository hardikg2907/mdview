import { describe, it, expect } from 'vitest';
import { filterOutline, ALL_LEVELS } from '../../src/client/lib/outline-filter.js';
import type { HeadingLevel, OutlineNode } from '../../src/shared/types.js';

function leaf(id: string, level: HeadingLevel, children: OutlineNode[] = []): OutlineNode {
  return { id, text: id, level, children };
}

const tree: OutlineNode[] = [
  leaf('a', 1, [
    leaf('a1', 2, [leaf('a1x', 3)]),
    leaf('a2', 2),
  ]),
  leaf('b', 1, [leaf('b1', 2, [leaf('b1x', 3)])]),
];

describe('filterOutline', () => {
  it('returns input shape when all levels visible', () => {
    const out = filterOutline(tree, new Set(ALL_LEVELS));
    expect(out.map((n) => n.id)).toEqual(['a', 'b']);
    expect(out[0]!.children.map((n) => n.id)).toEqual(['a1', 'a2']);
  });

  it('promotes children when parent level is hidden', () => {
    const out = filterOutline(tree, new Set([1, 3]));
    // a (level 1) and a's only-grandchild a1x (level 3) — a1 (level 2) is hidden
    expect(out.map((n) => n.id)).toEqual(['a', 'b']);
    expect(out[0]!.children.map((n) => n.id)).toEqual(['a1x']);
    expect(out[1]!.children.map((n) => n.id)).toEqual(['b1x']);
  });

  it('produces empty array when no levels visible', () => {
    expect(filterOutline(tree, new Set())).toEqual([]);
  });

  it('drops top-level nodes when their level is hidden, exposing children', () => {
    const out = filterOutline(tree, new Set([2]));
    expect(out.map((n) => n.id)).toEqual(['a1', 'a2', 'b1']);
  });
});
