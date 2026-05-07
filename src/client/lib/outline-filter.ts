import type { HeadingLevel, OutlineNode } from '../../shared/types.js';

export type LevelSet = ReadonlySet<HeadingLevel>;

export const ALL_LEVELS: HeadingLevel[] = [1, 2, 3, 4, 5, 6];

/**
 * Drop nodes whose level isn't in `visible`, promoting their children up to
 * the parent. Pure function — does not mutate input.
 */
export function filterOutline(nodes: OutlineNode[], visible: LevelSet): OutlineNode[] {
  const out: OutlineNode[] = [];
  for (const n of nodes) {
    const filteredChildren = filterOutline(n.children, visible);
    if (visible.has(n.level)) {
      out.push({ ...n, children: filteredChildren });
    } else {
      out.push(...filteredChildren);
    }
  }
  return out;
}
