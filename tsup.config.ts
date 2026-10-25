import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'mdview': 'src/cli.ts',
    // Loaded with new Worker(); resolved beside mdview.mjs at runtime.
    'regex-worker': 'src/server/fs/regex-worker.ts',
  },
  format: ['esm'],
  outDir: 'bin',
  outExtension: () => ({ js: '.mjs' }),
  target: 'node20',
  sourcemap: true,
  // Several test files rebuild bin/ at the same moment, and a clean in one
  // build would delete chunks another is about to spawn. Stale chunks are
  // dropped by `prepack` instead.
  clean: false,
  bundle: true,
  // Without splitting, esbuild hoists every external import of a dynamic
  // import() to the top of the single output file, so `--version` would still
  // load fastify, shiki and chokidar. Each lazily loaded module needs its own
  // chunk, and the chunks sit next to the entry in bin/.
  splitting: true,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
});
