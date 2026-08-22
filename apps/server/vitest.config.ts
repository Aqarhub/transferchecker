import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Every test boots a real PostgreSQL and drives the server over real HTTP,
    // and the suite shares the machine with eight other packages under turbo.
    testTimeout: 30_000,

    // AND THE EXPENSIVE WORK IS IN A HOOK, NOT IN A TEST. `beforeAll` boots
    // PGlite and applies every migration, and that budget is `hookTimeout`,
    // which `testTimeout` does not raise: the default stayed at ten seconds
    // while the raised budget guarded the cheap half. Measured on four cores:
    // 2,425ms idle, 5,065ms under load, and past ten seconds under a real
    // `turbo run test`, where the hook timed out and all 21 tests were skipped
    // while the suite reported a misleading TypeError from the teardown.
    // Sixty seconds matches `packages/db`, which boots the same database the
    // same way. Raising it changes no assertion: a hook that is actually
    // broken still fails, it just no longer depends on how many other packages
    // happen to be compiling beside it.
    hookTimeout: 60_000,
  },
});
