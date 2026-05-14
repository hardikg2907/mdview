import path from 'node:path';
import { DEFAULT_IGNORED_DIRS as DEFAULT_IGNORED_LIST } from '../../shared/ignore.js';

// Heavy build / dependency dirs that aren't dotfile-prefixed. Watching these
// blows past macOS's default 256 soft FD limit (EMFILE from kqueue) and Linux
// inotify's max_user_watches. Dotfile dirs (.git, .next, .cache, .venv, …) are
// already handled by the separate dotfile rule, so they don't appear here.
export const DEFAULT_IGNORED_DIRS: ReadonlySet<string> = new Set(DEFAULT_IGNORED_LIST);

export function buildIgnoreSet(extra: readonly string[] = []): ReadonlySet<string> {
  return new Set([...DEFAULT_IGNORED_DIRS, ...extra]);
}

export function isDirIgnored(name: string, set: ReadonlySet<string>): boolean {
  return name.startsWith('.') || set.has(name);
}

// Test the full path: any segment between `root` and `abs` that matches the
// ignore set (or starts with '.') wins. Comparison is basename-equality only —
// no globs, no regex — which is why §validateConfig rejects entries containing
// path separators or wildcards.
export function isPathIgnored(abs: string, root: string, set: ReadonlySet<string>): boolean {
  const rel = path.relative(root, abs);
  if (rel === '' || rel.startsWith('..')) return false;
  for (const seg of rel.split(path.sep)) {
    if (!seg) continue;
    if (seg.startsWith('.')) return true;
    if (set.has(seg)) return true;
  }
  return false;
}
