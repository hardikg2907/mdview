import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/client/index.html'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:7331',
    },
  },
});
