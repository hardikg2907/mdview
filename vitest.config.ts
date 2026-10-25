import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['tests/client/**', '**/node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'happy-dom',
          include: ['tests/client/**/*.{test,spec}.{ts,tsx}'],
        },
      },
    ],
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
});
