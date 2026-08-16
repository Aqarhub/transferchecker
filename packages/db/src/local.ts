// A real PostgreSQL, in this process, with the migrations actually applied.
//
// WHY THIS EXISTS RATHER THAN A TEST THAT READS THE SQL. Row level security is
// the one thing in this repository that cannot be verified by inspection. A
// policy that looks right and a policy that is right differ in ways only the
// planner knows: whether `with check` also covers an update that moves a row out
// of the organisation, whether a privilege granted by default outlives the
// revoke, whether a subquery in a predicate is evaluated in the caller's
// security context. Asserting on the text of a migration proves the text.
//
// So the tests boot PGlite, which is PostgreSQL compiled to WebAssembly, apply
// every migration file in journal order, and then try to read another
// organisation's rows as an ordinary authenticated client. That is the claim in
// PLAN.md section 7, checked by the engine that will enforce it.
//
// WHAT THIS FILE STANDS IN FOR. Supabase provides three roles and an `auth`
// schema before any of our migrations run, so a database that had neither could
// not even create the policies. `SUPABASE_BOOTSTRAP` below is that prelude, and
// the two functions are copied from Supabase's own definitions rather than
// approximated, because a shim that differs from the real one would be proving
// the shim.
//
// AND ONE VERSION DIFFERENCE IS DELIBERATELY VISIBLE. PGlite is PostgreSQL 18,
// Supabase runs 17. Nothing in this schema may use an 18 only feature, and the
// obvious temptation is exactly that: `uuidv7()` is native in 18 and absent in
// 17, which is why ids are generated in the application. A test asserts that no
// column defaults to it, so the difference cannot quietly become a dependency.

import { readFile } from 'node:fs/promises';
import { z } from 'zod';

/** The subset of a PGlite client this module needs. Passed in, never imported. */
export interface LocalClient {
  exec(query: string): Promise<unknown>;
  query(query: string, params?: unknown[]): Promise<unknown>;
}

/**
 * What Supabase has already created when our first migration runs.
 *
 * `auth.jwt()` and `auth.uid()` are Supabase's definitions verbatim: they read
 * the claims GoTrue put into a session setting, which is how a policy sees a
 * verified token without the request body being able to influence it.
 */
export const SUPABASE_BOOTSTRAP = `
  create schema if not exists auth;

  create or replace function auth.jwt() returns jsonb
    language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
      )::jsonb
    $$;

  create or replace function auth.uid() returns uuid
    language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$;

  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
`;

/**
 * The journal Drizzle Kit maintains, validated rather than trusted.
 *
 * It is generated, so it is well formed until somebody hand edits it during a
 * merge, which is exactly when a migration silently stops being applied.
 */
const JournalSchema = z.object({
  entries: z.array(z.object({ idx: z.number().int(), tag: z.string().min(1) })),
});

const MIGRATIONS = new URL('../migrations/', import.meta.url);

/** Every migration file, in the order the journal says they run. */
export async function migrationFiles(): Promise<{ tag: string; sql: string }[]> {
  const journal = JournalSchema.parse(
    JSON.parse(await readFile(new URL('meta/_journal.json', MIGRATIONS), 'utf8')),
  );
  const ordered = [...journal.entries].sort((left, right) => left.idx - right.idx);
  return Promise.all(
    ordered.map(async (entry) => ({
      tag: entry.tag,
      sql: await readFile(new URL(`${entry.tag}.sql`, MIGRATIONS), 'utf8'),
    })),
  );
}

/**
 * A database with the prelude and every migration applied, as the owner.
 *
 * Migrations run as the superuser because that is who runs them in production
 * too. Everything a test does after this runs as `authenticated`, which is the
 * role PostgREST connects as and therefore the only one whose view of the data
 * says anything about isolation.
 */
export async function prepare(client: LocalClient): Promise<string[]> {
  await client.exec(SUPABASE_BOOTSTRAP);
  const applied: string[] = [];
  for (const file of await migrationFiles()) {
    // Statements are separated by Drizzle's own breakpoint marker. Splitting on
    // it rather than on semicolons is what keeps a function body containing
    // semicolons in one piece.
    for (const statement of file.sql.split('--> statement-breakpoint')) {
      if (statement.trim() !== '') await client.exec(statement);
    }
    applied.push(file.tag);
  }
  return applied;
}

/**
 * Become an ordinary signed in client of one organisation.
 *
 * Two things happen and both matter. The role changes to `authenticated`, since
 * a superuser is exempt from row level security and would see everything no
 * matter what the policies said. And the claims are set to the token GoTrue
 * would have issued, with the organisation in `app_metadata`, which is the only
 * place a policy is allowed to read it from.
 */
export async function actAs(
  client: LocalClient,
  claims: { readonly orgId?: string; readonly userId?: string } = {},
): Promise<void> {
  const payload: Record<string, unknown> = { role: 'authenticated' };
  if (claims.userId !== undefined) payload['sub'] = claims.userId;
  if (claims.orgId !== undefined) payload['app_metadata'] = { org_id: claims.orgId };
  await client.query('select set_config($1, $2, false)', [
    'request.jwt.claims',
    JSON.stringify(payload),
  ]);
  await client.exec('set role authenticated');
}

/** Back to the migration owner, who is exempt from every policy here. */
export async function actAsOwner(client: LocalClient): Promise<void> {
  await client.exec('reset role');
  await client.query('select set_config($1, $2, false)', ['request.jwt.claims', '']);
}
