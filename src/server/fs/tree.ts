import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { MD_EXT } from '../../shared/tree-utils.js';
import type { TreeNode } from '../../shared/types.js';
import { DEFAULT_IGNORED_DIRS, isDirIgnored } from './ignore.js';

export interface WalkOptions {
  /** Directory basenames to skip. Defaults to DEFAULT_IGNORED_DIRS. Dotfiles
   *  are always skipped regardless of this set. */
  ignore?: ReadonlySet<string>;
}

export async function walkFolder(root: string, opts: WalkOptions = {}): Promise<TreeNode[]> {
  const ignore = opts.ignore ?? DEFAULT_IGNORED_DIRS;
  return walkInner(root, '', ignore);
}

async function walkInner(
  root: string,
  relBase: string,
  ignore: ReadonlySet<string>,
): Promise<TreeNode[]> {
  const absDir = path.join(root, relBase);
  const entries = await readdir(absDir, { withFileTypes: true });

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
      const children = await walkInner(root, childRel, ignore);
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
