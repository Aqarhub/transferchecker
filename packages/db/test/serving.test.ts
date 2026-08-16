// What the application's own role can actually do, measured rather than assumed.
//
// THIS FILE RECORDS A HOLE, AND IT IS DELIBERATE THAT IT PASSES. Every test in
// this package until now ran as the engine's own account, which owns every table
// and is a superuser, so row level security never applied to it. That is correct
// for testing isolation and it hides something else: none of the authentication
// work has ever run as the role a server will actually connect with.
//
// `tc_app` owns nothing, holds neither superuser nor BYPASSRLS, and is granted
// `authenticated`. Those are the properties `assertUnprivileged` demands, and
// they are the right ones. Their consequence, measured below, is that the four
// server-only tables are unreachable by it as well: a table with row level
// security on and no policy denies every row to everybody who does not own it,
// and the grants migration withholds the privilege from it too.
//
// SO THE AUTHENTICATION PATH CANNOT RUN AS `tc_app` AS THINGS STAND. Signing in
// reads `credentials`; the throttle writes `login_attempts`; a session writes
// `refresh_tokens`; a confirmation writes `email_verifications`; and signup
// writes an organisation that no token can yet name. Every one of them is denied
// here, and every one of them is green in the rest of this package because the
// tests run as an owner.
//
// WHICH ROLE THE AUTH ENDPOINTS RUN AS IS THE NEXT STEP'S DECISION, not this
// one's. It belongs with the application server, because it is a question about
// how the server connects, and answering it means new roles and new grants on
// the live instance. What this file does is make the answer deliberate: these
// assertions have to be edited by whoever closes the hole, so it cannot be
// closed by accident and cannot be forgotten either.

import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { ORG_A, ORG_B, USER_A, USER_B, freshDatabase, rows } from './harness';

const EMAIL = 'teacher@example.sa';

let client: PGlite;

/** Runs one statement as the application role and reports what happened. */
async function asApp(query: string): Promise<'denied' | 'allowed'> {
  await client.exec('set role tc_app');
  try {
    await client.query(query);
    return 'allowed';
  } catch (error) {
    await client.exec('reset role');
    if (error instanceof Error && /permission denied/i.test(error.message)) return 'denied';
    throw error;
  } finally {
    await client.exec('reset role');
  }
}

beforeEach(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  await client.exec(`
    create role tc_app login noinherit nosuperuser nobypassrls nocreatedb nocreaterole;
    grant authenticated to tc_app;
    insert into orgs (id, owner_id) values ('${ORG_A}', '${USER_A}');
    insert into users (id, org_id, email, locale, country)
      values ('${USER_A}', '${ORG_A}', '${EMAIL}', 'ar', 'SA');
    insert into credentials (user_id, org_id, password_hash)
      values ('${USER_A}', '${ORG_A}', '$argon2id$v=19$m=19456,t=2,p=1$aaaa$bbbb');
  `);
});

describe('the four tables the server handles', () => {
  it.each([
    ['a password hash', 'select count(*) from credentials'],
    ['a failure counter', `insert into login_attempts (email_hash, failures) values ('a', 1)`],
    ['a refresh token', `select count(*) from refresh_tokens`],
    ['a confirmation link', `select count(*) from email_verifications`],
  ])('is out of reach of the application role: %s', async (_what, query) => {
    expect(await asApp(query)).toBe('denied');
  });
});

describe('the writes signup makes', () => {
  // The organisation does not exist yet when signup runs, so no token can name
  // it and no policy can admit the row. `signup.ts` says this in words; this is
  // the same statement with the engine agreeing.
  it('cannot create an organisation, because no policy can admit one', async () => {
    expect(await asApp(`insert into orgs (id, owner_id) values ('${ORG_B}', '${USER_B}')`)).toBe(
      'denied',
    );
  });
});

describe('the lookup a sign in starts with', () => {
  // `tc_app` is granted `authenticated` and does NOT inherit from it, which is
  // the shape the guard test models and the reason the role can become a tenant
  // per request rather than being one. Before that switch it holds nothing at all.
  it('is denied even on the profile table, before any role switch', async () => {
    expect(await asApp(`select count(*) from users where email = '${EMAIL}'`)).toBe('denied');
  });

  // And after the switch it is worse than denied. The privilege is there and the
  // policy is there, and the policy filters on a claim that a request arriving
  // with a password and no token has not got. So the answer is an empty result
  // rather than an error, which is the shape of failure that reports nothing.
  it('finds nobody by address as a tenant with no claim, and raises no error', async () => {
    await client.exec('set role authenticated');
    const found = await rows<{ n: number }>(
      client,
      `select count(*)::int as n from users where email = '${EMAIL}'`,
    );
    await client.exec('reset role');
    expect(found[0]?.n).toBe(0);
  });
});
