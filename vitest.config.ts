import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/**/test/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    environment: 'node',
    environmentMatchGlobs: [
      ['packages/client/**/*.test.ts', 'happy-dom'],
      ['tests/unit/client/**/*.test.ts', 'happy-dom'],
    ],
    globals: false,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/types.ts'],
    },
  },
  resolve: {
    alias: {
      '@lfs/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
