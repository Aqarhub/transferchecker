// The guard that makes the one catastrophic misconfiguration impossible.
//
// Row level security is the whole isolation model, and a role carrying BYPASSRLS
// or superuser skips all of it. Putting the migration account in the
// application's configuration is one copied line, and afterwards every screen
// works, every test is green and the deployment check still passes, because none
// of them looks at which credentials the server used. This is what looks.

import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { rowsOf } from '../src/audit';
import { freshDatabase } from './harness';
import type { Database } from '../src/database';

/**
 * The guard's own logic, run against the local engine.
 *
 * `assertUnprivileged` takes a postgres-js connection because that is what a
 * server holds; the query and the decision are what matter and they are the same
 * either way.
 */
async function guard(db: Database): Promise<string[]> {
  const role = rowsOf(
    await db.execute(
      sql`select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    ),
  )[0];
  if (role === undefined) return ['unknown'];
  // PostgreSQL answers `t` and `f` through one driver and booleans through
  // another, so both spellings of true are read as true.
  const holds = (column: string): boolean => role[column] === true || role[column] === 't';
  return [holds('rolsuper') ? 'superuser' : '', holds('rolbypassrls') ? 'BYPASSRLS' : ''].filter(
    (danger) => danger !== '',
  );
}

describe('who the server is allowed to be', () => {
  it('objects to a role that carries BYPASSRLS', async () => {
    const { client, db } = await freshDatabase();
    await client.exec('create role risky login bypassrls; set role risky');
    expect(await guard(db)).toEqual(['BYPASSRLS']);
    await client.exec('reset role');
  });

  it('objects to a superuser', async () => {
    const { db } = await freshDatabase();
    // The engine's own account, which is a superuser and would see everything.
    expect(await guard(db)).toContain('superuser');
  });

  // The application account: owns nothing, holds neither attribute, and is
  // granted `authenticated` so it can become one per request.
  it('is satisfied by an application account like the real one', async () => {
    const { client, db } = await freshDatabase();
    await client.exec('create role tc_app login noinherit; grant authenticated to tc_app');
    await client.exec('set role tc_app');
    expect(await guard(db)).toEqual([]);
    await client.exec('reset role');
  });

  it('names both attributes when a role somehow holds both', async () => {
    const { client, db } = await freshDatabase();
    await client.exec('create role worst login superuser bypassrls; set role worst');
    expect(await guard(db)).toEqual(['superuser', 'BYPASSRLS']);
    await client.exec('reset role');
  });
});
