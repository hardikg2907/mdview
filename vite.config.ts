import { defineConfig } from 'vite';
import path from 'node:path';
import { woff2OnlyFonts } from './build/vite-woff2-only.js';

export default defineConfig({
  root: 'src/client',
  plugins: [woff2OnlyFonts()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'src/client/index.html'),
    },
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:7331',
    },
  },
});
