import { defineConfig } from 'vitest/config';

// These files start the CLI, hold real sockets or watchers, load Shiki, or bound
// CPU work by the wall clock (search budgets, linear-time checks). The default
// pool is one worker per core but one, and on a machine with efficiency cores
// and other load that puts them on a core several times slower than their
// deadlines assume. They run after every other file has finished, two at a time.
const HEAVY = [
  'tests/server/api-asset.test.ts',
  'tests/server/api-file.test.ts',
  'tests/server/cli-startup.test.ts',
  'tests/server/daemon-restart.test.ts',
  'tests/server/daemon-state.test.ts',
  'tests/server/embed-mode.test.ts',
  'tests/server/frontmatter.test.ts',
  'tests/server/grep.test.ts',
  'tests/server/host-guard.test.ts',
  'tests/server/html-tags.test.ts',
  'tests/server/links.test.ts',
  'tests/server/markdown.test.ts',
  'tests/server/math.test.ts',
  'tests/server/palette-flag.test.ts',
  'tests/server/shiki-themes.test.ts',
  'tests/server/shiki.test.ts',
  'tests/server/single-file-root.test.ts',
  'tests/server/watcher.test.ts',
];

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['tests/client/**', '**/node_modules/**', ...HEAVY],
        },
      },
      {
        extends: true,
        test: {
          name: 'server-heavy',
          environment: 'node',
          include: HEAVY,
          maxWorkers: 2,
          sequence: { groupOrder: 1 },
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
