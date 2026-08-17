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

import { sql } from 'drizzle-orm';
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
    // Pinned rather than inherited. [measured] A `citext` column failed to
    // resolve on a real instance because the extension had been installed from
    // a console session whose schema was not `public`, and the migration then
    // found the extension present and its type missing in the same breath. The
    // search path is a property of the connection, so it is set once here
    // instead of being restated by every migration that might depend on it.
    connection: { search_path: 'public' },
    // See the note on `pooled`. This is the setting that turns a working
    // application into an intermittent one under a transaction mode pooler.
    ...(settings.pooled ? { prepare: false } : {}),
  });
  return { db: drizzle(client), close: () => client.end() };
}

/**
 * Refuses to proceed on a connection that can skip every policy.
 *
 * THE GUARD EXISTS BECAUSE THE MISTAKE IS ONE LINE AND SILENT. Row level
 * security is the whole isolation model, and a role carrying `BYPASSRLS` or
 * superuser skips all of it, in every database, always. Put the migration
 * account's password in the application's configuration once, by copying the
 * wrong line out of a note, and every policy in the schema stops applying while
 * every screen keeps working, every test stays green and the deployment check
 * still passes, because none of them is looking at which credentials the server
 * used.
 *
 * So the server asks the database who it is, at startup, and refuses to run if
 * the answer is dangerous. [measured on the live instance] the owning account
 * really does carry `rolbypassrls = t`, so this is not a hypothetical.
 *
 * Migrations call `connect` without this on purpose: applying a migration is
 * exactly the work that needs the privileged account.
 */
export async function assertUnprivileged(connection: Connection): Promise<void> {
  const found = await connection.db.execute<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(sql`select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`);

  const rows = Array.isArray(found) ? found : [];
  const role = rows[0];
  if (role === undefined)
    throw new Error('assertUnprivileged: the database did not say who we are');

  const dangers = [role.rolsuper ? 'superuser' : '', role.rolbypassrls ? 'BYPASSRLS' : ''].filter(
    (danger) => danger !== '',
  );

  if (dangers.length > 0) {
    throw new Error(
      `Refusing to serve requests as "${role.rolname}", which holds ${dangers.join(' and ')}. ` +
        'A role with either skips every row level security policy in the database, so the ' +
        'isolation between organisations would not apply and nothing would report it. ' +
        'Use the application account, which owns nothing and holds neither.',
    );
  }
}

/** The two roles a request switches into, and the connection is a member of both. */
export const SERVING_ROLES = ['authenticated', 'tc_auth'] as const;

/**
 * Refuses to start when the connection cannot become the roles it has to become.
 *
 * THE OTHER HALF OF `assertUnprivileged`, and it fails in the opposite
 * direction. That one refuses a connection that can do too much; this one
 * refuses a connection that can do too little. The application role holds no
 * privilege of its own by design, so without membership of these two it can
 * reach nothing at all, and every request fails at the first query with a
 * message about permissions that says nothing about the cause.
 *
 * Membership is granted once, by hand, on the instance:
 *
 *   GRANT authenticated TO tc_app;
 *   GRANT tc_auth       TO tc_app;
 *
 * A deployment that skipped either line is a deployment that starts, passes its
 * health check and fails every sign in. This turns that into a refusal to boot.
 */
export async function assertRoles(connection: Connection): Promise<void> {
  const missing: string[] = [];
  for (const role of SERVING_ROLES) {
    const answer = await connection.db.execute<{ member: boolean }>(
      sql`select pg_has_role(current_user, ${role}, 'member') as member`,
    );
    const rows = Array.isArray(answer) ? answer : [];
    if (rows[0]?.member !== true) missing.push(role);
  }

  if (missing.length > 0) {
    throw new Error(
      `Refusing to serve requests: this connection cannot become ${missing.join(' or ')}. ` +
        'Every request switches role before it touches a table, so without membership the ' +
        'server starts, answers its health check and refuses every sign in. Grant it with ' +
        missing.map((role) => `GRANT ${role} TO <the application role>;`).join(' '),
    );
  }
}
