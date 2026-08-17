// The role authentication runs as, proved by running authentication as it.
//
// `serving.test.ts` measured the hole this closes: as the application role, a
// sign in could not read a password hash, a signup could not create an
// organisation, and the account lookup returned zero rows while raising nothing.
// Every other test in this package runs as the engine's own account, which owns
// every table, so none of them could have seen any of that.
//
// So this file connects the way production will: the session becomes `tc_app`,
// which owns nothing and holds no privilege of its own, and every operation goes
// through `asAuth`. What is proved is both halves of one decision:
//
//   1. The whole authentication path works. Signup, sign in, refresh, confirm.
//   2. It stops exactly where the migration says it stops. Not one row of
//      teacher data, and not one deletion of the evidence of a theft.
//
// The second half is what separates this role from the BYPASSRLS attribute the
// schema refused. Without it, this migration would have quietly added the very
// thing `0000_bootstrap.sql` declined to create.

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import {
  generateSigningKey,
  readSigningKey,
  checkAccessToken,
  verifierOf,
} from '@transferchecker/account';
import type { Accepted, TokenSetup } from '@transferchecker/account';
import { renew, signIn } from '../src/authenticate';
import { setPassword } from '../src/credentials';
import { createAccount } from '../src/signup';
import { issueConfirmation, redeemConfirmation } from '../src/mailbox';
import { asAuth, asTenant } from '../src/tenant';
import { rowsOf } from '../src/audit';
import type { Database } from '../src/database';
import { ORG_A, ORG_B, USER_A, USER_B, freshDatabase, rows } from './harness';

const EMAIL = 'teacher@example.sa';
const PASSWORD = 'a very long passphrase indeed';
const T0 = Date.UTC(2026, 7, 16, 12, 0, 0);
const MINUTE = 60_000;

const generated = generateSigningKey();
const signing = readSigningKey(generated.privateJwk);
if (!signing.ok) throw new Error('the generated key could not be read back');

const SETUP: TokenSetup = {
  keyring: { active: signing.key, verifying: [verifierOf(signing.key)] },
  names: { issuer: 'https://auth.transferchecker.app', audience: 'transferchecker-api' },
};

let client: PGlite;
let db: Database;

/**
 * Every message in an error chain.
 *
 * The query builder wraps the engine's answer in one of its own, so a test that
 * reads only the top message reads "Failed query" and learns nothing about why.
 */
function reasons(error: unknown): string {
  const parts: string[] = [];
  let cursor: unknown = error;
  while (cursor instanceof Error) {
    parts.push(cursor.message);
    cursor = cursor.cause;
  }
  return parts.join(' :: ');
}

/** One statement as the auth service, reporting only whether it was allowed. */
async function asService(query: string): Promise<'denied' | 'allowed'> {
  try {
    await client.exec('begin; set local role tc_auth');
    await client.query(query);
    await client.exec('rollback');
    return 'allowed';
  } catch (error) {
    await client.exec('rollback');
    if (error instanceof Error && /permission denied/i.test(error.message)) return 'denied';
    throw error;
  }
}

beforeEach(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
  await client.exec(`
    insert into orgs (id, owner_id) values ('${ORG_B}', '${USER_B}');
    insert into users (id, org_id, email, locale, country)
      values ('${USER_B}', '${ORG_B}', 'neighbour@example.sa', 'ar', 'SA');
    insert into templates (id, org_id, spec) values
      ('cccccccc-3333-4333-8333-cccccccccccc', '${ORG_B}', '{}'::jsonb);
    create role tc_app login noinherit nosuperuser nobypassrls nocreatedb nocreaterole;
    grant authenticated to tc_app;
    grant tc_auth to tc_app;
    set role tc_app;
  `);
});

const accepted: Accepted = {
  email: EMAIL,
  country: 'SA',
  language: 'ar',
  regime: 'sa',
  policyVersion: '2026-08-01',
};

/** Signup, then a password, exactly as an endpoint would run them. */
async function anAccount(): Promise<void> {
  await asAuth(db, async (tx) => {
    await createAccount(
      tx,
      accepted,
      {
        userId: USER_A,
        orgId: ORG_A,
        consentIds: [
          'dddddddd-1111-4111-8111-dddddddddddd',
          'eeeeeeee-1111-4111-8111-eeeeeeeeeeee',
        ],
      },
      { privacy: '2026-08-01', terms: '2026-08-01' },
      T0,
    );
    await setPassword(tx, { userId: USER_A, orgId: ORG_A }, PASSWORD, T0);
  });
}

describe('the authentication path, as the role that will run it', () => {
  it('creates an account across an organisation no token could name', async () => {
    await anAccount();
    await client.exec('reset role');
    const written = await rows<{ n: number }>(
      client,
      `select count(*)::int as n from consents where user_id = '${USER_A}'`,
    );
    expect(written[0]?.n).toBe(2);
  });

  it('signs in, and the token it mints verifies', async () => {
    await anAccount();
    const result = await asAuth(db, (tx) =>
      signIn(tx, { email: EMAIL, password: PASSWORD, now: T0 }, SETUP),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      checkAccessToken({
        token: result.grant.accessToken,
        keys: SETUP.keyring.verifying,
        now: T0,
        names: SETUP.names,
      }),
    ).toMatchObject({ ok: true, claims: { userId: USER_A, orgId: ORG_A } });
  });

  it('refuses a wrong password without saying more', async () => {
    await anAccount();
    const result = await asAuth(db, (tx) =>
      signIn(tx, { email: EMAIL, password: 'wrong entirely', now: T0 }, SETUP),
    );
    expect(result).toEqual({ ok: false, reason: 'wrong' });
  });

  it('rotates a refresh token', async () => {
    await anAccount();
    const first = await asAuth(db, (tx) =>
      signIn(tx, { email: EMAIL, password: PASSWORD, now: T0 }, SETUP),
    );
    if (!first.ok) return;
    const second = await asAuth(db, (tx) =>
      renew(tx, { presented: first.grant.refreshToken, now: T0 + MINUTE }, SETUP),
    );
    expect(second.ok).toBe(true);
  });

  it('issues and redeems a confirmation link', async () => {
    await anAccount();
    await asAuth(db, (tx) =>
      issueConfirmation(tx, {
        userId: USER_A,
        orgId: ORG_A,
        email: EMAIL,
        secret: 'the-link',
        now: T0,
      }),
    );
    const outcome = await asAuth(db, (tx) =>
      redeemConfirmation(tx, { secret: 'the-link', now: T0 + MINUTE }),
    );
    expect(outcome).toEqual({ state: 'confirm' });
  });

  // The failure mode of forgetting the wrapper. It has to be loud, because
  // nothing but this makes forgetting safe.
  it('fails loudly when an endpoint forgets to become the service', async () => {
    const failure = await db.execute(sql`select count(*) from credentials`).then(() => '', reasons);
    expect(failure).toMatch(/permission denied/i);
  });
});

describe('and where it stops, which is the point of the role', () => {
  it.each([
    ['a template', 'select count(*) from templates'],
    ['an exam', 'select count(*) from exams'],
    ['an answer key', 'select count(*) from answer_keys'],
    ['a pupil', 'select count(*) from students'],
    ['a scan', 'select count(*) from scans'],
    ['a usage counter', 'select count(*) from usage'],
  ])('cannot reach %s', async (_what, query) => {
    expect(await asService(query)).toBe('denied');
  });

  // The same rule the client policy keeps: a theft is revoked and never erased.
  it.each([
    ['a session family', 'delete from token_families'],
    ['a refresh token', 'delete from refresh_tokens'],
  ])('cannot delete %s', async (_what, query) => {
    expect(await asService(query)).toBe('denied');
  });

  it('cannot read an organisation, only create one', async () => {
    expect(await asService('select count(*) from orgs')).toBe('denied');
  });

  it('cannot edit a profile, which is the teacher own action', async () => {
    expect(await asService(`update users set locale = 'en'`)).toBe('denied');
  });
});

describe('and the isolation it was built not to break', () => {
  it('still keeps one organisation out of another', async () => {
    await anAccount();
    const seen = await asTenant(db, { userId: USER_A, orgId: ORG_A }, async (tx) => {
      const own = rowsOf(await tx.execute(sql`select count(*)::int as n from users`));
      const other = rowsOf(await tx.execute(sql`select count(*)::int as n from templates`));
      return { own: Number(own[0]?.['n']), neighbourTemplates: Number(other[0]?.['n']) };
    });
    expect(seen).toEqual({ own: 1, neighbourTemplates: 0 });
  });

  it('still keeps a password hash away from a signed in client', async () => {
    await anAccount();
    const failure = await asTenant(db, { userId: USER_A, orgId: ORG_A }, (tx) =>
      tx.execute(sql`select count(*) from credentials`),
    ).then(() => '', reasons);
    expect(failure).toMatch(/permission denied/i);
  });
});
