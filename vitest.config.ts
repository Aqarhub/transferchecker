import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Replaces the workspace file removed in Vitest 4. Each matched directory
    // needs its own package.json to be picked up.
    projects: ['packages/*'],

    coverage: {
      provider: 'v8',
      // Required in v4: coverage.all was removed, so without an explicit include
      // a source file no test imports simply vanishes from the report and
      // coverage reads artificially high.
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.{test,spec}.ts', '**/*.d.ts', '**/dist/**', '**/__fixtures__/**'],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
    },
  },
});
