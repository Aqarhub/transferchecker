// Checking the isolation on a real database, from the command line.
//
// Run it after every migration and after any change made by hand. A green test
// suite says the schema in this repository is right; this says the database in
// front of you is.
//
// Usage:  PGHOST=... PGDATABASE=... PGUSER=... PGPASSWORD=... pnpm verify

import process from 'node:process';
import { auditIsolation, probeIsolation } from './audit';
import { connect, settingsFromEnv } from './connect';

async function main(): Promise<void> {
  const found = settingsFromEnv(process.env);
  if (!found.ok) {
    process.stderr.write(`Set these first: ${found.missing.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }

  const { db, close } = connect(found.settings);
  try {
    process.stdout.write(`${found.settings.host}/${found.settings.database}\n\n`);
    const checks = [...(await auditIsolation(db)), await probeIsolation(db)];
    for (const check of checks) {
      process.stdout.write(
        `${check.ok ? 'PASS' : 'FAIL'}  ${check.name}\n        ${check.detail}\n`,
      );
    }
    const failed = checks.filter((check) => !check.ok);
    process.stdout.write(
      failed.length === 0
        ? `\nAll ${String(checks.length)} checks passed.\n`
        : `\n${String(failed.length)} of ${String(checks.length)} FAILED.\n`,
    );
    // A non zero exit so this can sit in a deployment step and stop it.
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

await main();
