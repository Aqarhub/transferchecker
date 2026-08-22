// Refresh token rotation, against a real database.
//
// `packages/account` already proves the decision logic exhaustively in memory.
// What is proved here is everything that only a database can be wrong about: the
// token is stored as a hash and never as itself, the revocation and the refusal
// land in one transaction, the whole family dies rather than the one token, and
// the table is unreachable by any signed in client.

import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { hashToken, refreshSession, revokeFamily, startSession } from '../src/session';
import { actAs, actAsOwner } from '../src/local';
import type { Database } from '../src/database';
import { ORG_A, USER_A, freshDatabase, rows } from './harness';

const FAMILY = 'f1111111-1111-4111-8111-111111111111';
const LIFETIME = 30 * 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 7, 16, 12, 0, 0);

let client: PGlite;
let db: Database;

async function anAccount(): Promise<void> {
  await client.exec(`
    insert into orgs (id, owner_id) values ('${ORG_A}', '${USER_A}');
    insert into users (id, org_id, email, locale, country)
      values ('${USER_A}', '${ORG_A}', 'a@example.sa', 'ar', 'SA');
  `);
}

beforeEach(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
  await anAccount();
  await startSession(db, {
    familyId: FAMILY,
    orgId: ORG_A,
    userId: USER_A,
    token: 'token-one',
    now: T0,
    lifetimeMs: LIFETIME,
    deviceLabel: 'Pixel 8a',
  });
});

describe('what the table holds', () => {
  // The single most valuable property of this table. A stolen backup of raw
  // refresh tokens is every live session taken at once.
  it('stores the hash of the token and never the token', async () => {
    const stored = await rows<{ id: string }>(client, 'select id from refresh_tokens');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(hashToken('token-one'));
    expect(stored[0]?.id).not.toContain('token-one');
    expect(stored[0]?.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('names the device in a way that identifies a session and nothing else', async () => {
    const family = await rows<{ device_label: string }>(
      client,
      'select device_label from token_families',
    );
    expect(family[0]?.device_label).toBe('Pixel 8a');
  });
});

describe('exchanging a token', () => {
  it('issues a successor and marks the presented one used', async () => {
    const { outcome, userId, orgId } = await refreshSession(db, {
      presented: 'token-one',
      successor: 'token-two',
      now: T0 + 1000,
      lifetimeMs: LIFETIME,
    });
    expect(outcome.ok).toBe(true);
    // Whose session this is rides out with the success, because the caller's
    // next act is minting an access token and the client never says who it is.
    expect(userId).toBe(USER_A);
    expect(orgId).toBe(ORG_A);

    const stored = await rows<{ id: string; used: boolean }>(
      client,
      'select id, (used_at is not null) as used from refresh_tokens order by created_at',
    );
    expect(stored).toEqual([
      { id: hashToken('token-one'), used: true },
      { id: hashToken('token-two'), used: false },
    ]);
  });

  it('refuses a token nobody issued, without writing anything', async () => {
    const { outcome } = await refreshSession(db, {
      presented: 'never-issued',
      successor: 'token-two',
      now: T0 + 1000,
      lifetimeMs: LIFETIME,
    });
    expect(outcome).toEqual({ ok: false, reason: 'unknown-token' });
    const stored = await rows<{ n: number }>(
      client,
      'select count(*)::int as n from refresh_tokens',
    );
    expect(stored[0]?.n).toBe(1);
  });

  it('refuses an expired token', async () => {
    const { outcome } = await refreshSession(db, {
      presented: 'token-one',
      successor: 'token-two',
      now: T0 + LIFETIME + 1,
      lifetimeMs: LIFETIME,
    });
    expect(outcome).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('reuse, which is the whole reason rotation is worth doing', () => {
  it('kills the entire family when a token is presented twice', async () => {
    await refreshSession(db, {
      presented: 'token-one',
      successor: 'token-two',
      now: T0 + 1000,
      lifetimeMs: LIFETIME,
    });

    const { outcome } = await refreshSession(db, {
      presented: 'token-one',
      successor: 'token-three',
      now: T0 + 2000,
      lifetimeMs: LIFETIME,
    });
    expect(outcome).toMatchObject({ ok: false, reason: 'reused', revokeFamily: FAMILY });

    // The family is revoked and the reason is recorded, because that record is
    // the only evidence the theft ever happened.
    const family = await rows<{ revoked: boolean; revoked_reason: string }>(
      client,
      'select (revoked_at is not null) as revoked, revoked_reason from token_families',
    );
    expect(family[0]).toEqual({ revoked: true, revoked_reason: 'reuse' });

    // And the successor the legitimate user was holding is dead too. Logging out
    // a real user is a small harm; leaving the thief signed in is the whole harm.
    const live = await rows<{ n: number }>(
      client,
      'select count(*)::int as n from refresh_tokens where used_at is null',
    );
    expect(live[0]?.n).toBe(0);
  });

  it('refuses the successor after the family is revoked', async () => {
    await refreshSession(db, {
      presented: 'token-one',
      successor: 'token-two',
      now: T0 + 1,
      lifetimeMs: LIFETIME,
    });
    await refreshSession(db, {
      presented: 'token-one',
      successor: 'token-x',
      now: T0 + 2,
      lifetimeMs: LIFETIME,
    });
    const { outcome } = await refreshSession(db, {
      presented: 'token-two',
      successor: 'token-four',
      now: T0 + 3,
      lifetimeMs: LIFETIME,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(['family-revoked', 'reused']).toContain(outcome.reason);
  });

  // Reuse is checked before expiry in the account layer, deliberately: a thief
  // presenting a token that is both is still a thief, and answering "expired"
  // throws away the only evidence that will ever exist.
  it('reports a token that is both used and expired as reuse, not as expiry', async () => {
    await refreshSession(db, {
      presented: 'token-one',
      successor: 'token-two',
      now: T0 + 1,
      lifetimeMs: LIFETIME,
    });
    const { outcome } = await refreshSession(db, {
      presented: 'token-one',
      successor: 'token-five',
      now: T0 + LIFETIME + 10_000,
      lifetimeMs: LIFETIME,
    });
    expect(outcome).toMatchObject({ ok: false, reason: 'reused' });
  });
});

describe('signing out', () => {
  it('revokes the family and says it was not a theft', async () => {
    await revokeFamily(db, FAMILY, T0 + 5000);
    const family = await rows<{ revoked_reason: string }>(
      client,
      'select revoked_reason from token_families',
    );
    expect(family[0]?.revoked_reason).toBe('signed-out');
    const { outcome } = await refreshSession(db, {
      presented: 'token-one',
      successor: 'token-two',
      now: T0 + 6000,
      lifetimeMs: LIFETIME,
    });
    expect(outcome).toMatchObject({ ok: false, reason: 'family-revoked' });
  });
});

describe('what a signed in client can reach', () => {
  // The strongest statement in the schema: row level security on, no policy at
  // all, and no privilege either. Nothing a client does needs to read this table.
  it('cannot read the refresh token table at all', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    await expect(client.exec('select * from refresh_tokens')).rejects.toThrow(/permission denied/i);
    await actAsOwner(client);
  });

  it('can see its own sessions', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    const seen = await rows<{ n: number }>(client, 'select count(*)::int as n from token_families');
    expect(seen[0]?.n).toBe(1);
    await actAsOwner(client);
  });

  // Tighter than the isolation everywhere else: same organisation is not enough,
  // it has to be you. The institution tier is where that stops being theoretical.
  it('cannot see another person session in its own organisation', async () => {
    await actAs(client, { orgId: ORG_A, userId: '99999999-9999-4999-8999-999999999999' });
    const seen = await rows<{ n: number }>(client, 'select count(*)::int as n from token_families');
    expect(seen[0]?.n).toBe(0);
    await actAsOwner(client);
  });

  it('cannot delete a family, so a theft cannot be erased', async () => {
    await actAsOwner(client);
    const granted = await rows<{ privilege_type: string }>(
      client,
      `select privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_name = 'token_families'`,
    );
    expect([...granted.map((g) => g.privilege_type)].sort()).toEqual(['SELECT', 'UPDATE']);
  });
});
