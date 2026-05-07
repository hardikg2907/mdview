import type { OutlineNode, HeadingLevel } from '../../shared/types.js';

export interface FlatHeading {
  id: string;
  level: HeadingLevel;
}

export function flattenHeadings(nodes: OutlineNode[]): FlatHeading[] {
  const out: FlatHeading[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, level: n.level });
    out.push(...flattenHeadings(n.children));
  }
  return out;
}

/**
 * Find the next heading id at the same level as `currentId`. `dir` of 1 walks
 * forward, -1 walks backward. Returns null if none found or if `currentId` is
 * not in the outline.
 */
export function nextSameLevelHeading(
  outline: OutlineNode[],
  currentId: string | null,
  dir: 1 | -1,
): string | null {
  const flat = flattenHeadings(outline);
  if (flat.length === 0) return null;
  if (!currentId) {
    // No active heading: pick first or last
    return dir === 1 ? (flat[0]?.id ?? null) : (flat[flat.length - 1]?.id ?? null);
  }
  const idx = flat.findIndex((h) => h.id === currentId);
  if (idx < 0) return null;
  const level = flat[idx]!.level;
  if (dir === 1) {
    for (let i = idx + 1; i < flat.length; i++) {
      if (flat[i]!.level === level) return flat[i]!.id;
    }
  } else {
    for (let i = idx - 1; i >= 0; i--) {
      if (flat[i]!.level === level) return flat[i]!.id;
    }
  }
  return null;
}
