// The auth service's hat, worn against a real database.
//
// Migration 0006 is a claim about privileges, and privileges are exactly what
// a green unit test run as the table owner cannot see. So everything here runs
// inside `asAuthService`, which puts on `set local role tc_auth` the way the
// server will, and the assertions are the two directions of the fence: the
// whole auth flow WORKS wearing the hat, and the hat reaches nothing else.

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import { checkSignup } from '@transferchecker/account';
import { createAccount } from '../src/signup';
import { attemptLogin, beginConfirmation, confirmEmail, setPassword } from '../src/credentials';
import { endSession, refreshSession, startSession } from '../src/session';
import { asAuthService } from '../src/tenant';
import { actAs, actAsOwner } from '../src/local';
import type { Database } from '../src/database';
import { ORG_A, USER_A, freshDatabase, rows } from './harness';

const EMAIL = 'teacher@example.sa';
const PASSWORD = 'a very long passphrase indeed';
const T0 = Date.UTC(2026, 7, 22, 9, 0, 0);
const FAMILY = 'f2222222-2222-4222-8222-222222222222';
const CONSENTS: [string, string] = [
  'c1111111-1111-4111-8111-111111111111',
  'c2222222-2222-4222-8222-222222222222',
];

let client: PGlite;
let db: Database;

beforeEach(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
});

/** The whole signup, exactly as the server will run it: one hat, one flow. */
async function signUp(): Promise<void> {
  await asAuthService(db, async (tx) => {
    const checked = checkSignup(
      {
        email: EMAIL,
        password: PASSWORD,
        country: 'SA',
        language: 'ar',
        policyVersion: '2026-08-01',
      },
      { languages: ['ar', 'en'], currentPolicyVersion: () => '2026-08-01' },
    );
    if (!checked.ok) throw new Error('signup refused in a test that owns its inputs');
    const plan = await createAccount(
      tx,
      checked.account,
      { userId: USER_A, orgId: ORG_A, consentIds: CONSENTS },
      { privacy: '2026-08-01', terms: '2026-08-01' },
      T0,
    );
    if (!plan.ok) throw new Error('stale consent in a test that owns its versions');
    await setPassword(tx, { userId: USER_A, orgId: ORG_A }, PASSWORD, T0);
  });
}

describe('the auth flow, wearing the tc_auth hat end to end', () => {
  it('signs up, signs in, rotates, confirms and signs out, all as tc_auth', async () => {
    await signUp();

    const login = await asAuthService(db, (tx) =>
      attemptLogin(tx, { email: EMAIL, password: PASSWORD, now: T0 + 1_000 }),
    );
    expect(login.outcome).toEqual({ ok: true, confirmed: false });
    expect(login.userId).toBe(USER_A);
    expect(login.orgId).toBe(ORG_A);

    await asAuthService(db, (tx) =>
      startSession(tx, {
        familyId: FAMILY,
        orgId: ORG_A,
        userId: USER_A,
        token: 'refresh-one',
        now: T0 + 1_000,
        lifetimeMs: 30 * 24 * 60 * 60_000,
      }),
    );

    const rotated = await asAuthService(db, (tx) =>
      refreshSession(tx, {
        presented: 'refresh-one',
        successor: 'refresh-two',
        now: T0 + 2_000,
        lifetimeMs: 30 * 24 * 60 * 60_000,
      }),
    );
    expect(rotated.outcome.ok).toBe(true);
    expect(rotated.userId).toBe(USER_A);
    expect(rotated.orgId).toBe(ORG_A);

    await asAuthService(db, (tx) =>
      beginConfirmation(tx, { userId: USER_A, token: 'confirm-token', now: T0 + 3_000 }),
    );
    expect(
      await asAuthService(db, (tx) =>
        confirmEmail(tx, { token: 'confirm-token', now: T0 + 4_000 }),
      ),
    ).toBe('confirmed');

    await asAuthService(db, (tx) => endSession(tx, 'refresh-two', T0 + 5_000));
    const family = await rows<{ revoked_reason: string }>(
      client,
      'select revoked_reason from token_families',
    );
    expect(family[0]?.revoked_reason).toBe('signed-out');
  });
});

describe('the fence, in both directions', () => {
  it('lets tc_auth read a credentials row and refuses it a single scan', async () => {
    await signUp();
    await client.exec('set role tc_auth');
    const hashes = await rows<{ n: number }>(client, 'select count(*)::int as n from credentials');
    expect(hashes[0]?.n).toBe(1);
    await expect(client.exec('select * from scans')).rejects.toThrow(/permission denied/i);
    await expect(client.exec('select * from exams')).rejects.toThrow(/permission denied/i);
    await actAsOwner(client);
  });

  it('still refuses a signed in teacher every secret, hat or no hat', async () => {
    await signUp();
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    await expect(client.exec('select * from credentials')).rejects.toThrow(/permission denied/i);
    await expect(client.exec('select * from refresh_tokens')).rejects.toThrow(/permission denied/i);
    await actAsOwner(client);
  });

  it('takes the hat off when the transaction ends', async () => {
    // `set local role` must not outlive `asAuthService`, or the next tenant
    // request on this pooled connection would run as the auth service.
    await asAuthService(db, (tx) => tx.execute(sql`select 1`));
    const who = await rows<{ role: string }>(client, 'select current_user as role');
    expect(who[0]?.role).not.toBe('tc_auth');
  });
});
