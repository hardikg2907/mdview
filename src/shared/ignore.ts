// Shared so the client can list the same defaults in the tooltip that the
// server uses to skip directories. Helpers that need `node:path` live in
// `src/server/fs/ignore.ts`.
export const DEFAULT_IGNORED_DIRS: readonly string[] = [
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'vendor',
  '__pycache__',
  'venv',
  'Pods',
  'DerivedData',
  '_build',
] as const;
