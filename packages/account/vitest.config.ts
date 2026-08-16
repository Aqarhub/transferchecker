import { defineConfig } from 'vitest/config';

// Each package carries its own config. Without one, running vitest from a
// package directory walks up to the root config, whose project globs then
// resolve against the wrong directory and match nothing.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
