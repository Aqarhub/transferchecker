import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // A database boots inside each test file, and Argon2id is deliberately slow.
    testTimeout: 30_000,
    // The boot itself happens in a beforeAll, and under the whole monorepo's
    // parallel test load it can cross vitest's ten second hook default.
    hookTimeout: 60_000,
  },
});
