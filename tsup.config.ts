import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'mdview': 'src/cli.ts',
  },
  format: ['esm'],
  outDir: 'bin',
  outExtension: () => ({ js: '.mjs' }),
  target: 'node20',
  sourcemap: true,
  clean: false,
  bundle: true,
  splitting: false,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
});
