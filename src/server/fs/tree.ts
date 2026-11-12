import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { MD_EXT } from '../../shared/tree-utils.js';
import type { TreeNode } from '../../shared/types.js';
import { DEFAULT_IGNORED_DIRS, isDirIgnored } from './ignore.js';
import { Limiter } from './limiter.js';

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
/** Bounds concurrent readdir() calls across all levels of one walk so deep trees never hit EMFILE. */
const WALK_CONCURRENCY = 16;

export async function walkFolder(root: string, opts: WalkOptions = {}): Promise<TreeNode[]> {
  const ignore = opts.ignore ?? DEFAULT_IGNORED_DIRS;
  const slots = new Limiter(WALK_CONCURRENCY);
  return walkInner(root, opts.relBase ?? '', ignore, 0, slots);
}

async function walkInner(
  absDir: string,
  relBase: string,
  ignore: ReadonlySet<string>,
  depth: number,
  slots: Limiter,
): Promise<TreeNode[]> {
  if (depth >= MAX_WALK_DEPTH) return [];

  let entries: import('node:fs').Dirent[];
  const release = await slots.acquire(1);
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
  } finally {
    release();
  }

  const out: TreeNode[] = [];
  const subdirs: Array<{ name: string; childAbs: string; childRel: string }> = [];

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
      subdirs.push({
        name: entry.name,
        childAbs: path.join(absDir, entry.name),
        childRel,
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

  if (subdirs.length > 0) {
    const walkedDirs = await Promise.all(
      subdirs.map(async (d) => ({
        name: d.name,
        relPath: d.childRel,
        type: 'dir' as const,
        children: await walkInner(d.childAbs, d.childRel, ignore, depth + 1, slots),
      })),
    );
    out.push(...walkedDirs);
  }

  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}
