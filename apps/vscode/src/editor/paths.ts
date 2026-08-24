import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Returns the forward-slash relative path from folderFsPath to fileFsPath,
 * or null if the file is not inside the folder (or equals the folder root).
 */
export function toWorkspaceRelPath(folderFsPath: string, fileFsPath: string): string | null {
  const rel = path.relative(folderFsPath, fileFsPath);
  if (!rel || path.isAbsolute(rel) || rel.startsWith('..')) return null;
  return rel.split(path.sep).join('/');
}

/**
 * Resolves a forward-slash relative path (from an untrusted webview message)
 * to an absolute path, returning it only if it stays inside folderFsPath.
 *
 * Why: incoming link/heading messages cross the webview trust boundary. The
 * message validator already rejects '..' segments and absolute paths, but this
 * is the containment check (CWE-22) immediately before the path reaches the
 * filesystem — never open a file outside the workspace folder.
 *
 * Containment is enforced on the *canonical* path (fs.realpathSync), so a
 * symlink inside the folder that points outside it cannot escape. We fail
 * closed: if the base or the target can't be canonicalized (e.g. the target
 * doesn't exist), we return null rather than open it.
 */
export function resolveInsideFolder(folderFsPath: string, relPath: string): string | null {
  if (relPath.length === 0) return null;

  let base: string;
  try {
    base = fs.realpathSync(path.resolve(folderFsPath));
  } catch {
    return null;
  }

  // Cheap lexical rejection first: the folder root itself (not a file) and
  // obvious escapes, before touching the filesystem again.
  const lexical = path.resolve(base, relPath);
  if (lexical === base || !lexical.startsWith(base + path.sep)) return null;

  // Canonicalize the target to defeat symlink escapes; reject anything whose
  // real location is the folder root or outside the folder.
  let real: string;
  try {
    real = fs.realpathSync(lexical);
  } catch {
    return null;
  }
  if (real === base || !real.startsWith(base + path.sep)) return null;
  return real;
}
