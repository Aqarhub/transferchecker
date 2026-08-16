// Opening a connection, and the two settings that are wrong by default.
//
// Kept out of the package's main entry on purpose. Everything else here works
// against any Drizzle Postgres database, including the one that boots inside a
// test, and only this file knows which driver is in use. Importing it is a
// decision a caller makes rather than something that arrives with the schema.
//
// NOTHING HERE READS A SECRET FROM A FILE. The settings come from the
// environment and the password never leaves it. `.gitignore` already excludes
// `.env`, and the owning account's credentials in particular must never appear
// in this repository: on the database this deploys to that account carries
// BYPASSRLS [measured], so leaking it is not a leaked table, it is a leaked
// database with every policy in it skipped.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export interface Settings {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  /** TLS. On by default and only turned off deliberately. */
  readonly ssl: boolean;
  /**
   * Whether this endpoint is a connection pooler in transaction mode.
   *
   * It changes two things and both bite silently. Prepared statements have to be
   * turned off, because a pooler may hand the next statement to a different
   * backend that never saw the prepare. And migrations must not run through it
   * at all: a migration is one long transaction holding a session it assumes is
   * its own. `migrate` refuses rather than discovering that halfway through.
   */
  readonly pooled: boolean;
}

export type SettingsResult =
  | { readonly ok: true; readonly settings: Settings }
  | { readonly ok: false; readonly missing: readonly string[] };

const REQUIRED = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'] as const;

/**
 * Settings from the environment, or the list of what is not set.
 *
 * A list rather than the first missing one, so somebody setting this up learns
 * everything they still need in one run instead of one variable per attempt.
 */
export function settingsFromEnv(env: Record<string, string | undefined>): SettingsResult {
  const missing = REQUIRED.filter((name) => (env[name] ?? '') === '');
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    settings: {
      host: env['PGHOST'] ?? '',
      port: Number(env['PGPORT'] ?? '5432'),
      database: env['PGDATABASE'] ?? '',
      user: env['PGUSER'] ?? '',
      password: env['PGPASSWORD'] ?? '',
      // Opt OUT rather than in. A default that has to be remembered is a default
      // that is forgotten on the day somebody sets up a second environment.
      ssl: (env['PGSSL'] ?? 'require') !== 'disable',
      pooled: (env['PGPOOLED'] ?? 'false') === 'true',
    },
  };
}

/**
 * The concrete driver type rather than the package's driver agnostic one.
 *
 * Everything else takes `Database` and does not care what answered. The migrator
 * is the exception: it needs the real client to run a migration as one session,
 * which is the same reason it may not go through a pooler.
 */
export interface Connection {
  readonly db: ReturnType<typeof drizzle>;
  readonly close: () => Promise<void>;
}

export function connect(settings: Settings): Connection {
  const client = postgres({
    host: settings.host,
    port: settings.port,
    database: settings.database,
    username: settings.user,
    password: settings.password,
    ...(settings.ssl ? { ssl: 'require' as const } : {}),
    // See the note on `pooled`. This is the setting that turns a working
    // application into an intermittent one under a transaction mode pooler.
    ...(settings.pooled ? { prepare: false } : {}),
  });
  return { db: drizzle(client), close: () => client.end() };
}
