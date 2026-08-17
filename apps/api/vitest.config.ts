import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // A database boots inside each test file, and Argon2id is deliberately slow.
    testTimeout: 30_000,
  },
});
