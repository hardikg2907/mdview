import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
    alias: {
      vscode: path.resolve(__dirname, 'tests/unit/__mocks__/vscode.ts'),
    },
  },
});
