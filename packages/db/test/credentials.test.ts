// Signing in against a real database, and the two ways it could tell an attacker
// who has an account here.
//
// `packages/account` proves the decision. What is proved here is the wiring, and
// in particular the two properties that are invisible in the decision: that an
// unknown address costs the same time as a known one, and that the throttle
// counts the same for both.

import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { CONFIRMATION_LIFETIME_MS, FREE_ATTEMPTS } from '@transferchecker/account';
import {
  DECOY_HASH,
  attemptLogin,
  beginConfirmation,
  confirmEmail,
  emailKey,
  forgetStaleAttempts,
  hashPassword,
  setPassword,
  verifyPassword,
} from '../src/credentials';
import { actAs, actAsOwner } from '../src/local';
import type { Database } from '../src/database';
import { ORG_A, USER_A, freshDatabase, rows } from './harness';

const EMAIL = 'teacher@example.sa';
const PASSWORD = 'a very long passphrase indeed';
const T0 = Date.UTC(2026, 7, 16, 12, 0, 0);

let client: PGlite;
let db: Database;

beforeEach(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
  await client.exec(`
    insert into orgs (id, owner_id) values ('${ORG_A}', '${USER_A}');
    insert into users (id, org_id, email, locale, country)
      values ('${USER_A}', '${ORG_A}', '${EMAIL}', 'ar', 'SA');
  `);
  await setPassword(db, { userId: USER_A, orgId: ORG_A }, PASSWORD, T0);
});

describe('the hash', () => {
  it('is Argon2id at the parameters OWASP asks for', async () => {
    const stored = await rows<{ password_hash: string }>(
      client,
      'select password_hash from credentials',
    );
    expect(stored[0]?.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('never contains the password', async () => {
    const stored = await rows<{ password_hash: string }>(
      client,
      'select password_hash from credentials',
    );
    expect(stored[0]?.password_hash).not.toContain(PASSWORD);
  });

  // Salted, so two people who choose the same password do not share a hash and a
  // precomputed table is worth nothing.
  it('differs every time the same password is hashed', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('treats a corrupt stored hash as a failed login and not as a crash', async () => {
    expect(await verifyPassword('not a hash at all', PASSWORD)).toBe(false);
  });
});

describe('signing in', () => {
  it('accepts the right password and says who it was', async () => {
    const result = await attemptLogin(db, { email: EMAIL, password: PASSWORD, now: T0 });
    expect(result.outcome).toEqual({ ok: true, confirmed: false });
    expect(result.userId).toBe(USER_A);
    expect(result.orgId).toBe(ORG_A);
  });

  it('accepts the address in any casing, because one mailbox is one account', async () => {
    const result = await attemptLogin(db, {
      email: 'Teacher@Example.SA',
      password: PASSWORD,
      now: T0,
    });
    expect(result.outcome).toMatchObject({ ok: true });
  });

  it('refuses the wrong password', async () => {
    const result = await attemptLogin(db, { email: EMAIL, password: 'wrong one', now: T0 });
    expect(result.outcome).toMatchObject({ ok: false, reason: 'wrong' });
    expect(result.userId).toBeUndefined();
  });

  // Confirmation gates cloud sync and not signing in. A teacher grades on a
  // phone that has never had a network.
  it('lets an unconfirmed mailbox in, and says it is unconfirmed', async () => {
    const result = await attemptLogin(db, { email: EMAIL, password: PASSWORD, now: T0 });
    expect(result.outcome).toEqual({ ok: true, confirmed: false });
    await client.exec(`update credentials set confirmed_at = now()`);
    const after = await attemptLogin(db, { email: EMAIL, password: PASSWORD, now: T0 });
    expect(after.outcome).toEqual({ ok: true, confirmed: true });
  });
});

describe('what a login refuses to reveal', () => {
  it('answers an address with no account exactly as it answers a wrong password', async () => {
    const unknown = await attemptLogin(db, {
      email: 'nobody@example.sa',
      password: PASSWORD,
      now: T0,
    });
    const wrong = await attemptLogin(db, { email: EMAIL, password: 'wrong one', now: T0 });
    expect(unknown.outcome).toEqual(wrong.outcome);
  });

  // THE TIMING IS THE OTHER HALF. Skipping the hash for an unknown address makes
  // that answer about a hundred milliseconds faster, and a hundred milliseconds
  // is a readable directory of who has an account here. The decoy costs what a
  // real comparison costs.
  it('spends about as long on an unknown address as on a real one', async () => {
    const time = async (email: string): Promise<number> => {
      const started = process.hrtime.bigint();
      await attemptLogin(db, { email, password: 'wrong one', now: T0 });
      return Number(process.hrtime.bigint() - started) / 1e6;
    };
    const real = await time(EMAIL);
    const unknown = await time('nobody@example.sa');
    // Generous, because a shared machine is noisy. The failure this catches is
    // the one where the unknown path skips hashing entirely and returns in a
    // millisecond while the real one takes a hundred.
    expect(Math.abs(real - unknown)).toBeLessThan(Math.max(real, unknown) * 0.8);
  });

  it('keeps a throttle row for an address that has no account', async () => {
    await attemptLogin(db, { email: 'nobody@example.sa', password: 'x', now: T0 });
    const kept = await rows<{ email_hash: string; failures: number }>(
      client,
      'select email_hash, failures from login_attempts',
    );
    expect(kept).toEqual([{ email_hash: emailKey('nobody@example.sa'), failures: 1 }]);
  });

  it('stores the hash of the address and never the address', async () => {
    await attemptLogin(db, { email: EMAIL, password: 'wrong one', now: T0 });
    const kept = await rows<{ email_hash: string }>(
      client,
      'select email_hash from login_attempts',
    );
    expect(kept[0]?.email_hash).not.toContain('teacher');
    expect(kept[0]?.email_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the throttle', () => {
  const failOnce = (at: number) => attemptLogin(db, { email: EMAIL, password: 'no', now: at });

  it('counts failures and forgets them on success', async () => {
    await failOnce(T0);
    await failOnce(T0 + 1);
    let kept = await rows<{ failures: number }>(client, 'select failures from login_attempts');
    expect(kept[0]?.failures).toBe(2);

    await attemptLogin(db, { email: EMAIL, password: PASSWORD, now: T0 + 2 });
    kept = await rows<{ failures: number }>(client, 'select failures from login_attempts');
    expect(kept).toEqual([]);
  });

  it('starts refusing once the free attempts are spent', async () => {
    for (let at = 0; at <= FREE_ATTEMPTS; at += 1) await failOnce(T0 + at);
    const tooSoon = await attemptLogin(db, {
      email: EMAIL,
      password: PASSWORD,
      now: T0 + FREE_ATTEMPTS + 1,
    });
    expect(tooSoon.outcome).toMatchObject({ ok: false, reason: 'too-soon' });
  });

  // An attempt refused by the throttle never reached a password, so counting it
  // would let an attacker push a real user's delay to the ceiling by hammering
  // an endpoint that was already refusing them.
  it('does not count an attempt it refused itself', async () => {
    for (let at = 0; at <= FREE_ATTEMPTS; at += 1) await failOnce(T0 + at);
    const before = await rows<{ failures: number }>(client, 'select failures from login_attempts');
    await failOnce(T0 + FREE_ATTEMPTS + 1);
    await failOnce(T0 + FREE_ATTEMPTS + 2);
    const after = await rows<{ failures: number }>(client, 'select failures from login_attempts');
    expect(after[0]?.failures).toBe(before[0]?.failures);
  });

  // The property that says we built a delay and not a lock: whatever an attacker
  // does, the real teacher gets in by waiting, never by appealing to support.
  it('always lets the right password through after the wait', async () => {
    for (let at = 0; at < 20; at += 1) await failOnce(T0 + at * 60_000);
    const later = await attemptLogin(db, {
      email: EMAIL,
      password: PASSWORD,
      now: T0 + 20 * 60_000 + 60_000,
    });
    expect(later.outcome).toMatchObject({ ok: true });
  });

  it('clears rows nobody is waiting on any more', async () => {
    await failOnce(T0);
    await forgetStaleAttempts(db, T0 + 86_400_000);
    const kept = await rows<{ n: number }>(client, 'select count(*)::int as n from login_attempts');
    expect(kept[0]?.n).toBe(0);
  });
});

describe('what a signed in client can reach', () => {
  it('cannot read a password hash, not even its own', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    await expect(client.exec('select * from credentials')).rejects.toThrow(/permission denied/i);
    await actAsOwner(client);
  });

  it('cannot read the failure counters', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    await expect(client.exec('select * from login_attempts')).rejects.toThrow(/permission denied/i);
    await actAsOwner(client);
  });

  it('leaves the decoy hash a real one, so it costs real time', async () => {
    expect(DECOY_HASH).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(DECOY_HASH, PASSWORD)).toBe(false);
  });
});

describe('confirming the mailbox', () => {
  const TOKEN = 'JBSWY3DPEHPK3PXP_JBSWY3DPEHPK3PXP_JBSWY3DPE';

  it('confirms once, and reports every later click as already, timestamp untouched', async () => {
    await beginConfirmation(db, { userId: USER_A, token: TOKEN, now: T0 });
    expect(await confirmEmail(db, { token: TOKEN, now: T0 + 60_000 })).toBe('confirmed');
    const first = await rows<{ confirmed_at: Date }>(
      client,
      'select confirmed_at from credentials',
    );

    // Corporate mail scanners click before people do, so the link is not
    // burned on first use. The person's own later click reads as success and
    // moves nothing.
    expect(await confirmEmail(db, { token: TOKEN, now: T0 + 120_000 })).toBe('already');
    const second = await rows<{ confirmed_at: Date }>(
      client,
      'select confirmed_at from credentials',
    );
    expect(second[0]?.confirmed_at.getTime()).toBe(first[0]?.confirmed_at.getTime());
  });

  it('flips what the login reports, which is what gates cloud sync', async () => {
    const before = await attemptLogin(db, { email: EMAIL, password: PASSWORD, now: T0 });
    expect(before.outcome).toEqual({ ok: true, confirmed: false });

    await beginConfirmation(db, { userId: USER_A, token: TOKEN, now: T0 });
    await confirmEmail(db, { token: TOKEN, now: T0 + 1_000 });

    const after = await attemptLogin(db, { email: EMAIL, password: PASSWORD, now: T0 + 2_000 });
    expect(after.outcome).toEqual({ ok: true, confirmed: true });
  });

  it('refuses a link older than a day, to the millisecond the account layer names', async () => {
    await beginConfirmation(db, { userId: USER_A, token: TOKEN, now: T0 });
    expect(await confirmEmail(db, { token: TOKEN, now: T0 + CONFIRMATION_LIFETIME_MS })).toBe(
      'expired',
    );
    const kept = await rows<{ confirmed_at: Date | null }>(
      client,
      'select confirmed_at from credentials',
    );
    expect(kept[0]?.confirmed_at).toBeNull();
  });

  it('lets a resend kill the old link, which is the whole revocation story', async () => {
    await beginConfirmation(db, { userId: USER_A, token: TOKEN, now: T0 });
    await beginConfirmation(db, { userId: USER_A, token: 'a-second-token', now: T0 + 60_000 });

    expect(await confirmEmail(db, { token: TOKEN, now: T0 + 120_000 })).toBe('unknown');
    expect(await confirmEmail(db, { token: 'a-second-token', now: T0 + 120_000 })).toBe(
      'confirmed',
    );
  });

  it('answers unknown for a token nobody issued, and stores only hashes', async () => {
    await beginConfirmation(db, { userId: USER_A, token: TOKEN, now: T0 });
    expect(await confirmEmail(db, { token: 'guessed', now: T0 + 1_000 })).toBe('unknown');

    const stored = await rows<{ confirmation_token_hash: string }>(
      client,
      'select confirmation_token_hash from credentials',
    );
    expect(stored[0]?.confirmation_token_hash).not.toContain(TOKEN);
    expect(stored[0]?.confirmation_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
