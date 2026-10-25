import { realpath } from 'node:fs/promises';
import path from 'node:path';

/**
 * Largest markdown file the server reads. Rendering is synchronous, so one
 * huge file would stall every other request.
 */
export const MAX_MARKDOWN_BYTES = 16 * 1024 * 1024;

/** The path names something outside the root. Callers answer 400. */
export class OutsideRootError extends Error {}

function isWithin(absRoot: string, candidate: string): boolean {
  const rel = path.relative(absRoot, candidate);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/**
 * True when any segment of `rel` starts with `.`. Dot-directories and dotfiles
 * hold tool state (.git, .ssh, .vscode, .env), never content a document links
 * to. Checked on the normalised path, so `a/../b.png` is judged by where it
 * lands rather than by the `..` it passed through.
 *
 * Callers check both the requested path and `relative(realRoot, realTarget)`:
 * the requested name alone misses an in-root link into `.git`, and on Windows
 * an 8.3 short name (`GIT~1`) that names `.git` without a leading dot.
 */
export function hasDotSegment(rel: string): boolean {
  return path
    .normalize(rel)
    .split(/[\\/]/)
    .some((seg) => seg.startsWith('.') && seg !== '.');
}

export interface ResolveOptions {
  /** `realpath(root)`, when the caller resolves many paths under one root. */
  realRoot?: string;
}

/**
 * Map an untrusted root-relative path to the real absolute path of an existing
 * file or directory inside `root`.
 *
 * The lexical check alone is not enough: a symlink inside the root (a cloned
 * repo's `notes.png -> ~/.ssh/id_ed25519`) passes it and the read then follows
 * the link out. So the target is resolved through every link and checked
 * again. Both sides are realpath'd because the root itself may sit behind a
 * link (macOS `/tmp` is `/private/tmp`). Links that land inside the root are
 * fine.
 *
 * Throws `OutsideRootError` for an escape, and the filesystem's own error
 * (ENOENT for a missing file or a dangling link) when there is nothing there.
 */
export async function resolveSafePath(
  root: string,
  relPath: string,
  opts: ResolveOptions = {},
): Promise<string> {
  if (path.isAbsolute(relPath)) {
    throw new OutsideRootError(`Refusing absolute path: ${relPath}`);
  }
  const absRoot = path.resolve(root);
  const candidate = path.resolve(absRoot, relPath);
  if (!isWithin(absRoot, candidate)) {
    throw new OutsideRootError(`Path resolves outside root: ${relPath}`);
  }
  const realRoot = opts.realRoot ?? (await realpath(absRoot));
  const realCandidate = await realpath(candidate);
  if (!isWithin(realRoot, realCandidate)) {
    throw new OutsideRootError(`Path resolves outside root: ${relPath}`);
  }
  return realCandidate;
}
