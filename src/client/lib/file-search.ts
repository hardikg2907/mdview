import type { TreeNode } from '../../shared/types.js';

export interface FileEntry {
  relPath: string;
  name: string;
}

export function flattenMdFiles(tree: TreeNode[]): FileEntry[] {
  const out: FileEntry[] = [];
  function walk(nodes: TreeNode[]): void {
    for (const n of nodes) {
      if (n.type === 'file' && n.isMarkdown) out.push({ relPath: n.relPath, name: n.name });
      else if (n.type === 'dir' && n.children) walk(n.children);
    }
  }
  walk(tree);
  return out;
}

export interface RankedFile extends FileEntry {
  score: number;
  matchRanges: Array<[number, number]>;
}

/**
 * Rank a file against a query.
 * - Exact substring match in basename: highest tier
 * - Exact substring match in full path: middle tier
 * - Fuzzy subsequence match: lowest tier
 * - Returns null if no match
 */
export function rankFile(file: FileEntry, query: string): RankedFile | null {
  if (!query) {
    return { ...file, score: 0, matchRanges: [] };
  }
  const q = query.toLowerCase();
  const path = file.relPath.toLowerCase();
  const name = file.name.toLowerCase();

  // Exact substring match in basename (best)
  const nameIdx = name.indexOf(q);
  if (nameIdx !== -1) {
    const pathStart = file.relPath.length - file.name.length + nameIdx;
    return {
      ...file,
      score: 1000 - pathStart - file.relPath.length,
      matchRanges: [[pathStart, pathStart + q.length]],
    };
  }

  // Exact substring match in full path
  const pathIdx = path.indexOf(q);
  if (pathIdx !== -1) {
    return {
      ...file,
      score: 500 - pathIdx - file.relPath.length,
      matchRanges: [[pathIdx, pathIdx + q.length]],
    };
  }

  // Fuzzy: every char of q appears in path in order
  const ranges: Array<[number, number]> = [];
  let qi = 0;
  let runStart = -1;
  for (let i = 0; i < path.length && qi < q.length; i++) {
    if (path[i] === q[qi]) {
      if (runStart === -1) runStart = i;
      qi++;
    } else if (runStart !== -1) {
      ranges.push([runStart, runStart + 1]);
      runStart = -1;
    }
  }
  if (runStart !== -1) ranges.push([runStart, qi - (q.length - 1) + runStart]);
  if (qi === q.length) {
    return { ...file, score: 100 - file.relPath.length, matchRanges: ranges };
  }

  return null;
}

export function rankAll(files: FileEntry[], query: string, max = 50): RankedFile[] {
  const ranked: RankedFile[] = [];
  for (const f of files) {
    const r = rankFile(f, query);
    if (r) ranked.push(r);
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, max);
}
