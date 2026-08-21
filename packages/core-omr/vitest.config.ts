import { defineConfig } from 'vitest/config';

// Each package carries its own config. Without one, running vitest from a
// package directory walks up to the root config, whose project globs then
// resolve against the wrong directory and match nothing.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],

    // Vitest's default budget is five seconds, and this package is the one that
    // cannot live inside it. Every test here renders a sheet, photographs it
    // through the pinhole model and scans it back, so the work is real image
    // work rather than a few assertions.
    //
    // AND THE BUDGET IS SPENT ON CONTENTION, NOT ON THE TEST. `turbo run test`
    // starts all nine packages at once; on a four core machine [measured] the
    // criterion 13 perturbation case takes 2.7 seconds alone and 5.9 under that
    // load, so it fails on the machine and passes on the developer's, which is
    // the worst way for a suite to be wrong. Raising the budget changes no
    // assertion: a test that is actually broken still fails, it just no longer
    // depends on how many other packages happen to be compiling beside it.
    testTimeout: 60_000,
  },
});
