// Confirming a mailbox against a real database.
//
// `packages/account` proves the decision, exhaustively and without a row. What is
// proved here is everything only a database can be wrong about: the link is
// stored as a hash and never as itself, the flag and the used mark land in one
// transaction, an address that changed after the mail went out is refused, and
// the table is unreachable by any signed in client.

import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  CONFIRMATION_LIFETIME_MS,
  RESEND_DAILY_CAP,
  RESEND_WINDOW_MS,
} from '@transferchecker/account';
import { setPassword } from '../src/credentials';
import {
  forgetStaleConfirmations,
  issueConfirmation,
  mayResendTo,
  redeemConfirmation,
} from '../src/mailbox';
import { hashSecret, newSecret } from '../src/secret';
import { actAs, actAsOwner } from '../src/local';
import type { Database } from '../src/database';
import { ORG_A, USER_A, freshDatabase, rows } from './harness';

const EMAIL = 'teacher@example.sa';
const SECRET = 'a-secret-from-a-link';
const T0 = Date.UTC(2026, 7, 16, 12, 0, 0);
const MINUTE = 60_000;

let client: PGlite;
let db: Database;

/** As text, because the driver hands back a Date and two Dates are never `Object.is`. */
const confirmedAt = async (): Promise<string> => {
  const found = await rows<{ at: string | null }>(
    client,
    "select coalesce(to_char(confirmed_at, 'YYYY-MM-DD HH24:MI:SS.MS'), '') as at from credentials",
  );
  return found[0]?.at ?? '';
};

beforeEach(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
  await client.exec(`
    insert into orgs (id, owner_id) values ('${ORG_A}', '${USER_A}');
    insert into users (id, org_id, email, locale, country)
      values ('${USER_A}', '${ORG_A}', '${EMAIL}', 'ar', 'SA');
  `);
  await setPassword(db, { userId: USER_A, orgId: ORG_A }, 'a very long passphrase', T0);
  await issueConfirmation(db, {
    userId: USER_A,
    orgId: ORG_A,
    email: EMAIL,
    secret: SECRET,
    now: T0,
  });
});

describe('what the table holds', () => {
  it('stores the hash of the link and never the link', async () => {
    const stored = await rows<{ id: string }>(client, 'select id from email_verifications');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(hashSecret(SECRET));
    expect(stored[0]?.id).not.toContain(SECRET);
  });

  // Without this column, a link sent to the old mailbox confirms the new one.
  it('stores the address the mail was sent to', async () => {
    const stored = await rows<{ email: string }>(client, 'select email from email_verifications');
    expect(stored[0]?.email).toBe(EMAIL);
  });

  it('lowercases the address, so one mailbox is not two rows', async () => {
    await issueConfirmation(db, {
      userId: USER_A,
      orgId: ORG_A,
      email: 'Teacher@Example.SA',
      secret: 'another',
      now: T0,
    });
    const stored = await rows<{ email: string }>(
      client,
      `select email from email_verifications where id = '${hashSecret('another')}'`,
    );
    expect(stored[0]?.email).toBe(EMAIL);
  });
});

describe('redeeming', () => {
  it('confirms the mailbox and marks the link used, together', async () => {
    expect(await redeemConfirmation(db, { secret: SECRET, now: T0 + MINUTE })).toEqual({
      state: 'confirm',
    });
    expect(await confirmedAt()).not.toBe('');
    const used = await rows<{ used: boolean }>(
      client,
      'select (used_at is not null) as used from email_verifications',
    );
    expect(used[0]?.used).toBe(true);
  });

  // The mail gateway that opens every link, and the person who clicks twice.
  // Both must be told it worked.
  it('says already, the second time', async () => {
    await redeemConfirmation(db, { secret: SECRET, now: T0 + MINUTE });
    const before = await confirmedAt();
    expect(await redeemConfirmation(db, { secret: SECRET, now: T0 + 2 * MINUTE })).toEqual({
      state: 'already',
    });
    // And the moment of confirmation is not moved by the second click.
    expect(await confirmedAt()).toBe(before);
  });

  it('refuses a link nobody issued, and writes nothing', async () => {
    expect(await redeemConfirmation(db, { secret: 'never-issued', now: T0 })).toEqual({
      state: 'refuse',
      reason: 'unknown-link',
    });
    expect(await confirmedAt()).toBe('');
  });

  it('refuses an expired link', async () => {
    expect(
      await redeemConfirmation(db, { secret: SECRET, now: T0 + CONFIRMATION_LIFETIME_MS + 1 }),
    ).toEqual({ state: 'refuse', reason: 'expired' });
    expect(await confirmedAt()).toBe('');
  });

  // The one refusal with a security meaning: proving control of the old mailbox
  // must not mark the new one as proven.
  it('refuses a link for an address the profile no longer carries', async () => {
    await client.exec(`update users set email = 'moved@example.sa' where id = '${USER_A}'`);
    expect(await redeemConfirmation(db, { secret: SECRET, now: T0 + MINUTE })).toEqual({
      state: 'refuse',
      reason: 'address-changed',
    });
    expect(await confirmedAt()).toBe('');
  });

  it('confirms whatever casing the address is stored in', async () => {
    await issueConfirmation(db, {
      userId: USER_A,
      orgId: ORG_A,
      email: 'TEACHER@EXAMPLE.SA',
      secret: 'mixed-case',
      now: T0,
    });
    expect(await redeemConfirmation(db, { secret: 'mixed-case', now: T0 + MINUTE })).toEqual({
      state: 'confirm',
    });
  });

  // A resend does not kill the earlier link, so whichever mail arrives first works.
  it('accepts an earlier link after a later one was issued', async () => {
    await issueConfirmation(db, {
      userId: USER_A,
      orgId: ORG_A,
      email: EMAIL,
      secret: 'the-second-one',
      now: T0 + 5 * MINUTE,
    });
    expect(await redeemConfirmation(db, { secret: SECRET, now: T0 + 6 * MINUTE })).toEqual({
      state: 'confirm',
    });
  });
});

describe('asking for the mail again', () => {
  it('refuses inside the cooldown and allows after it', async () => {
    expect((await mayResendTo(db, USER_A, T0 + 10_000)).ok).toBe(false);
    expect((await mayResendTo(db, USER_A, T0 + MINUTE)).ok).toBe(true);
  });

  it('refuses once the window is full', async () => {
    for (let index = 1; index < RESEND_DAILY_CAP; index += 1) {
      await issueConfirmation(db, {
        userId: USER_A,
        orgId: ORG_A,
        email: EMAIL,
        secret: `resend-${String(index)}`,
        now: T0 + index * 2 * MINUTE,
      });
    }
    const out = await mayResendTo(db, USER_A, T0 + 60 * MINUTE);
    expect(out).toMatchObject({ ok: false, reason: 'daily-cap' });
  });

  it('counts only this person', async () => {
    expect((await mayResendTo(db, '99999999-9999-4999-8999-999999999999', T0)).ok).toBe(true);
  });
});

describe('housekeeping', () => {
  const shortLived = async (): Promise<void> => {
    await issueConfirmation(db, {
      userId: USER_A,
      orgId: ORG_A,
      email: EMAIL,
      secret: 'short-lived',
      now: T0,
      lifetimeMs: MINUTE,
    });
  };

  const remaining = async (secret: string): Promise<number> => {
    const left = await rows<{ n: number }>(
      client,
      `select count(*)::int as n from email_verifications where id = '${hashSecret(secret)}'`,
    );
    return left[0]?.n ?? -1;
  };

  // The condition that is easy to leave out. These rows are also the resend
  // counter, so purging an expired one that is still inside the ceiling's window
  // would hand back a slot to whoever is filling somebody else's inbox.
  it('keeps an expired link that still counts toward the ceiling', async () => {
    await shortLived();
    await forgetStaleConfirmations(db, T0 + 2 * MINUTE);
    expect(await remaining('short-lived')).toBe(1);
  });

  it('drops it once it is past the window as well', async () => {
    await shortLived();
    await forgetStaleConfirmations(db, T0 + RESEND_WINDOW_MS + MINUTE);
    expect(await remaining('short-lived')).toBe(0);
  });

  it('keeps a link that has not expired at all', async () => {
    await forgetStaleConfirmations(db, T0 + CONFIRMATION_LIFETIME_MS - MINUTE);
    expect(await remaining(SECRET)).toBe(1);
  });
});

describe('what a signed in client can reach', () => {
  // The fourth table in the schema that reaches nobody: security on, no policy,
  // and no privilege either.
  it('cannot read the table at all', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    await expect(client.exec('select * from email_verifications')).rejects.toThrow(
      /permission denied/i,
    );
    await actAsOwner(client);
  });

  it('cannot write itself a link either', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    await expect(
      client.exec(`insert into email_verifications (id, user_id, org_id, email, expires_at)
        values ('x', '${USER_A}', '${ORG_A}', '${EMAIL}', now())`),
    ).rejects.toThrow(/permission denied/i);
    await actAsOwner(client);
  });
});

describe('the secret in the link', () => {
  it('is long, random and safe in a URL', () => {
    const first = newSecret();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(newSecret());
    expect(encodeURIComponent(first)).toBe(first);
  });
});
