import { defineConfig } from 'vitest/config';

// Each package carries its own config. Without one, running vitest from a
// package directory walks up to the root config, whose project globs then
// resolve against the wrong directory and match nothing.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Several tests render a page, photograph it at camera resolution and
    // scan it, sometimes five times over for a sweep of angles or bends.
    // Under the parallel load of the whole monorepo's suite those legitimate
    // seconds cross vitest's five second default and read as failures.
    testTimeout: 60_000,
  },
});
