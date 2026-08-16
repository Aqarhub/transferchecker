import { defineConfig } from 'vitest/config';

// Each package carries its own config. The row level security tests boot a real
// PostgreSQL in this process and apply every migration to it, which takes a few
// seconds, so the timeout is raised above the default for those files alone.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
