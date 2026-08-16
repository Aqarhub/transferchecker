// The whole chain, on a real database: a password becomes a token, the token
// becomes a claim, and the claim is what a policy admits rows on.
//
// Every link of that has been proved on its own. What has never been proved
// until here is that they fit: that the claim the minter writes is spelled the
// way the policy reads it, in the place the policy looks, for the role the
// policy applies to. Any one of those three being subtly wrong produces a token
// that verifies perfectly and a client that sees nothing, or worse, everything.
//
// SO THE TEST THAT MATTERS IS THE LAST ONE IN THIS FILE. It signs in with a
// password, verifies the token it got back, hands the verified claims to
// `asTenant`, and counts what an ordinary signed in client can reach.

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import {
  ACCESS_LIFETIME_MS,
  checkAccessToken,
  generateSigningKey,
  readSigningKey,
  verifierOf,
} from '@transferchecker/account';
import type { TokenSetup } from '@transferchecker/account';
import { REFRESH_LIFETIME_MS, renew, signIn } from '../src/authenticate';
import { setPassword } from '../src/credentials';
import { issueConfirmation, redeemConfirmation } from '../src/mailbox';
import { revokeFamily } from '../src/session';
import { asTenant } from '../src/tenant';
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

beforeEach(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
  await client.exec(`
    insert into orgs (id, owner_id) values ('${ORG_A}', '${USER_A}'), ('${ORG_B}', '${USER_B}');
    insert into users (id, org_id, email, locale, country) values
      ('${USER_A}', '${ORG_A}', '${EMAIL}', 'ar', 'SA'),
      ('${USER_B}', '${ORG_B}', 'other@example.sa', 'ar', 'SA');
  `);
  await setPassword(db, { userId: USER_A, orgId: ORG_A }, PASSWORD, T0);
});

const signInOk = async (now = T0): Promise<Awaited<ReturnType<typeof signIn>>> =>
  signIn(db, { email: EMAIL, password: PASSWORD, now, deviceLabel: 'Pixel 8a' }, SETUP);

describe('signing in', () => {
  it('gives back a pair, and the access token verifies', async () => {
    const result = await signInOk();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const check = checkAccessToken({
      token: result.grant.accessToken,
      keys: SETUP.keyring.verifying,
      now: T0,
      names: SETUP.names,
    });
    expect(check).toMatchObject({
      ok: true,
      claims: { userId: USER_A, orgId: ORG_A, emailConfirmed: false },
    });
  });

  // The two live on different clocks for a reason: one cannot be withdrawn and
  // is therefore short, and the other is a row and can be revoked at any moment.
  it('makes the access token short and the refresh token long', async () => {
    const result = await signInOk();
    if (!result.ok) return;
    expect(result.grant.accessExpiresAt).toBe(T0 + ACCESS_LIFETIME_MS);
    expect(result.grant.refreshExpiresAt).toBe(T0 + REFRESH_LIFETIME_MS);
  });

  it('records the session as a family, with the device the person would recognise', async () => {
    await signInOk();
    const family = await rows<{ n: number; device_label: string }>(
      client,
      'select count(*)::int as n, min(device_label) as device_label from token_families',
    );
    expect(family[0]).toMatchObject({ n: 1, device_label: 'Pixel 8a' });
  });

  it('writes the refresh token as a hash, never as itself', async () => {
    const result = await signInOk();
    if (!result.ok) return;
    const stored = await rows<{ id: string }>(client, 'select id from refresh_tokens');
    expect(stored[0]?.id).not.toBe(result.grant.refreshToken);
    expect(stored[0]?.id).toMatch(/^[0-9a-f]{64}$/);
  });

  // One answer for a wrong password and for an address with no account. The
  // login layer already costs the same time for both; this is the other half.
  it('refuses a wrong password and an unknown address the same way', async () => {
    const wrong = await signIn(db, { email: EMAIL, password: 'not it at all', now: T0 }, SETUP);
    const nobody = await signIn(
      db,
      { email: 'nobody@example.sa', password: PASSWORD, now: T0 },
      SETUP,
    );
    expect(wrong).toEqual({ ok: false, reason: 'wrong' });
    expect(nobody).toEqual({ ok: false, reason: 'wrong' });
  });

  it('mints no token at all for a refused attempt', async () => {
    await signIn(db, { email: EMAIL, password: 'not it at all', now: T0 }, SETUP);
    const stored = await rows<{ n: number }>(
      client,
      'select count(*)::int as n from refresh_tokens',
    );
    expect(stored[0]?.n).toBe(0);
  });

  it('reports the throttle as its own refusal, so the server can back off', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signIn(db, { email: EMAIL, password: 'wrong', now: T0 }, SETUP);
    }
    const out = await signIn(db, { email: EMAIL, password: PASSWORD, now: T0 }, SETUP);
    expect(out).toMatchObject({ ok: false, reason: 'too-soon' });
  });
});

describe('renewing', () => {
  it('rotates the refresh token and mints a fresh access token', async () => {
    const first = await signInOk();
    if (!first.ok) return;

    const second = await renew(
      db,
      { presented: first.grant.refreshToken, now: T0 + MINUTE },
      SETUP,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.grant.refreshToken).not.toBe(first.grant.refreshToken);
    expect(second.grant.accessToken).not.toBe(first.grant.accessToken);
    expect(second.grant).toMatchObject({ userId: USER_A, orgId: ORG_A });
  });

  it('refuses the old token afterwards, and kills the family', async () => {
    const first = await signInOk();
    if (!first.ok) return;
    await renew(db, { presented: first.grant.refreshToken, now: T0 + MINUTE }, SETUP);

    const replayed = await renew(
      db,
      { presented: first.grant.refreshToken, now: T0 + 2 * MINUTE },
      SETUP,
    );
    expect(replayed).toEqual({ ok: false, reason: 'reused' });

    const live = await rows<{ n: number }>(
      client,
      'select count(*)::int as n from refresh_tokens where used_at is null',
    );
    expect(live[0]?.n).toBe(0);
  });

  it('refuses a token from a family that was signed out', async () => {
    const first = await signInOk();
    if (!first.ok) return;
    const family = await rows<{ id: string }>(client, 'select id from token_families');
    await revokeFamily(db, family[0]?.id ?? '', T0 + MINUTE);
    expect(
      await renew(db, { presented: first.grant.refreshToken, now: T0 + 2 * MINUTE }, SETUP),
    ).toEqual({ ok: false, reason: 'family-revoked' });
  });

  // The reason a client that is told to confirm its mailbox should refresh and
  // retry rather than send the person back to a sign in screen.
  it('picks up a mailbox confirmed after the session started', async () => {
    const first = await signInOk();
    if (!first.ok) return;
    expect(first.grant.emailConfirmed).toBe(false);

    await issueConfirmation(db, {
      userId: USER_A,
      orgId: ORG_A,
      email: EMAIL,
      secret: 'the-link',
      now: T0,
    });
    await redeemConfirmation(db, { secret: 'the-link', now: T0 + MINUTE });

    const second = await renew(
      db,
      { presented: first.grant.refreshToken, now: T0 + 2 * MINUTE },
      SETUP,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.grant.emailConfirmed).toBe(true);
    const check = checkAccessToken({
      token: second.grant.accessToken,
      keys: SETUP.keyring.verifying,
      now: T0 + 2 * MINUTE,
      names: SETUP.names,
    });
    expect(check).toMatchObject({ ok: true, claims: { emailConfirmed: true } });
  });
});

describe('the chain, end to end', () => {
  // The one that would catch a claim spelled `orgId` instead of `org_id`, or
  // written to `user_metadata`, or a role switch that never happened. Each of
  // those produces a token that verifies and a client that sees nothing.
  it('turns a password into a session that sees its own organisation and no other', async () => {
    const result = await signInOk();
    if (!result.ok) return;

    const check = checkAccessToken({
      token: result.grant.accessToken,
      keys: SETUP.keyring.verifying,
      now: T0,
      names: SETUP.names,
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;

    const seen = await asTenant(db, check.claims, async (tx) => {
      const own = rowsOf(await tx.execute(sql`select count(*)::int as n from orgs`));
      const neighbour = rowsOf(
        await tx.execute(sql`select count(*)::int as n from orgs where id = ${ORG_B}`),
      );
      return { own: Number(own[0]?.['n']), neighbour: Number(neighbour[0]?.['n']) };
    });

    expect(seen).toEqual({ own: 1, neighbour: 0 });
  });
});
