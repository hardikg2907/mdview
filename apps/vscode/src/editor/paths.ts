import * as path from 'node:path';

/**
 * Returns the forward-slash relative path from folderFsPath to fileFsPath,
 * or null if the file is not inside the folder (or equals the folder root).
 */
export function toWorkspaceRelPath(folderFsPath: string, fileFsPath: string): string | null {
  const rel = path.relative(folderFsPath, fileFsPath);
  if (!rel || path.isAbsolute(rel) || rel.startsWith('..')) return null;
  return rel.split(path.sep).join('/');
}
