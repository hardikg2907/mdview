import path from 'node:path';

export function resolveSafePath(root: string, relPath: string): string {
  if (path.isAbsolute(relPath)) {
    throw new Error(`Refusing absolute path: ${relPath}`);
  }
  const absRoot = path.resolve(root);
  const candidate = path.resolve(absRoot, relPath);
  const rel = path.relative(absRoot, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path resolves outside root: ${relPath}`);
  }
  return candidate;
}
