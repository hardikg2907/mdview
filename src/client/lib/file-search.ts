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

interface LowerPair {
  path: string;
  name: string;
}

const lowerCache = new WeakMap<FileEntry, LowerPair>();

function getLower(file: FileEntry): LowerPair {
  let cached = lowerCache.get(file);
  if (!cached) {
    cached = { path: file.relPath.toLowerCase(), name: file.name.toLowerCase() };
    lowerCache.set(file, cached);
  }
  return cached;
}

function rankFileLower(file: FileEntry, q: string): RankedFile | null {
  const { path, name } = getLower(file);

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
  let lastMatchEnd = -1;
  for (let i = 0; i < path.length && qi < q.length; i++) {
    if (path[i] === q[qi]) {
      if (runStart === -1) runStart = i;
      lastMatchEnd = i + 1;
      qi++;
    } else if (runStart !== -1) {
      ranges.push([runStart, i]);
      runStart = -1;
    }
  }
  if (qi !== q.length) return null;
  if (runStart !== -1) ranges.push([runStart, lastMatchEnd]);
  return { ...file, score: 100 - file.relPath.length, matchRanges: ranges };
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
  return rankFileLower(file, query.toLowerCase());
}

export function rankAll(files: FileEntry[], query: string, max = 50): RankedFile[] {
  if (!query) {
    return files.slice(0, max).map((f) => ({ ...f, score: 0, matchRanges: [] }));
  }
  const q = query.toLowerCase();
  const ranked: RankedFile[] = [];
  for (const f of files) {
    const r = rankFileLower(f, q);
    if (r) ranked.push(r);
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, max);
}

/** First markdown file in tree order, or null if there are none. */
export function findFirstMd(nodes: TreeNode[]): string | null {
  for (const n of nodes) {
    if (n.type === 'file' && n.isMarkdown) return n.relPath;
    if (n.type === 'dir' && n.children) {
      const sub = findFirstMd(n.children);
      if (sub) return sub;
    }
  }
  return null;
}

/**
 * First markdown file at or below `prefix` — a workspace path, so either a bare
 * root id or a folder inside one. Backs `?root=`, which is how `mdview <folder>`
 * says "focus this one" without knowing what's in it.
 *
 * Only the branch leading to the prefix is descended, so this doesn't degrade
 * into a full walk of every open root.
 */
export function findFirstMdUnder(nodes: TreeNode[], prefix: string): string | null {
  for (const n of nodes) {
    const inside = n.relPath === prefix || n.relPath.startsWith(`${prefix}/`);
    if (n.type === 'file') {
      if (inside && n.isMarkdown) return n.relPath;
      continue;
    }
    if (n.children && (inside || prefix.startsWith(`${n.relPath}/`))) {
      const sub = findFirstMdUnder(n.children, prefix);
      if (sub) return sub;
    }
  }
  return null;
}
