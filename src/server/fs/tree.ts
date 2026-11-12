import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { MD_EXT } from '../../shared/tree-utils.js';
import type { TreeNode } from '../../shared/types.js';
import { DEFAULT_IGNORED_DIRS, isDirIgnored } from './ignore.js';

export interface WalkOptions {
  /** Directory basenames to skip. Defaults to DEFAULT_IGNORED_DIRS. Dotfiles
   *  are always skipped regardless of this set. */
  ignore?: ReadonlySet<string>;
  /**
   * Prefix for every emitted relPath — the root id, so paths come out
   * workspace-scoped. Affects the wire path only, never which directory is read.
   */
  relBase?: string;
}

export const MAX_WALK_DEPTH = 64;

export async function walkFolder(root: string, opts: WalkOptions = {}): Promise<TreeNode[]> {
  const ignore = opts.ignore ?? DEFAULT_IGNORED_DIRS;
  return walkInner(root, opts.relBase ?? '', ignore, 0);
}

async function walkInner(
  absDir: string,
  relBase: string,
  ignore: ReadonlySet<string>,
  depth: number,
): Promise<TreeNode[]> {
  if (depth >= MAX_WALK_DEPTH) return [];

  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (
      depth > 0 &&
      (code === 'EACCES' || code === 'EPERM' || code === 'ENOENT' || code === 'ENOTDIR')
    ) {
      return [];
    }
    throw err;
  }

  const out: TreeNode[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (isDirIgnored(entry.name, ignore)) continue;
    } else if (entry.name.startsWith('.')) {
      continue;
    }

    // relPaths are URL-shaped (always '/'), not OS-native. resolveSafePath uses
    // path.resolve which accepts '/' on Windows, and the client/links code
    // assumes forward slashes. Do not "fix" this with path.join.
    const childRel = relBase ? `${relBase}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const children = await walkInner(
        path.join(absDir, entry.name),
        childRel,
        ignore,
        depth + 1,
      );
      out.push({
        name: entry.name,
        relPath: childRel,
        type: 'dir',
        children,
      });
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      out.push({
        name: entry.name,
        relPath: childRel,
        type: 'file',
        isMarkdown: MD_EXT.has(ext),
      });
    }
  }

  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}
