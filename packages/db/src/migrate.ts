// Applying the migrations to a real database, from a machine that can reach it.
//
// Run as the owning account and only ever as the owning account. Every other
// connection this product makes is an application role that owns nothing, which
// is the whole reason the policies mean anything.
//
// Usage:  PGHOST=... PGDATABASE=... PGUSER=... PGPASSWORD=... pnpm migrate

import process from 'node:process';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { connect, settingsFromEnv } from './connect';
import { migrationFiles } from './local';

const MIGRATIONS = new URL('../migrations', import.meta.url).pathname;

async function main(): Promise<void> {
  const found = settingsFromEnv(process.env);
  if (!found.ok) {
    process.stderr.write(`Set these first: ${found.missing.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }

  // A migration is one long transaction that assumes the session is its own. A
  // transaction mode pooler does not promise that, and finding out in the middle
  // leaves a half applied schema, which is the worst state of the three.
  if (found.settings.pooled) {
    process.stderr.write(
      'Refusing to migrate through a pooled endpoint. Use the direct connection.\n',
    );
    process.exitCode = 1;
    return;
  }

  const files = await migrationFiles();
  process.stdout.write(
    `${String(files.length)} migrations to consider on ${found.settings.host}/${found.settings.database} as ${found.settings.user}\n`,
  );
  for (const file of files) process.stdout.write(`  ${file.tag}\n`);

  const { db, close } = connect(found.settings);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS });
    process.stdout.write('\nApplied. Anything already recorded was skipped.\n');
  } finally {
    await close();
  }
}

await main();
