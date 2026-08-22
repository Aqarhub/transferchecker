import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Every test boots a real PostgreSQL and drives the server over real HTTP,
    // and the suite shares the machine with eight other packages under turbo.
    testTimeout: 30_000,
  },
});
