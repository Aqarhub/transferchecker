// Signing up, from the pure decision in `packages/account` to three rows.
//
// The account package already proves its own rules. What is proved here is the
// wiring: that the regime is derived and not accepted from the caller, that the
// consent lands with its version, that a stale version writes nothing at all,
// and that the whole thing is one transaction rather than three writes with a
// window between them.

import { beforeEach, describe, expect, it } from 'vitest';
import { checkSignup } from '@transferchecker/account';
import type { Accepted } from '@transferchecker/account';
import type { PGlite } from '@electric-sql/pglite';
import { createAccount, planAccount } from '../src/signup';
import type { Database } from '../src/database';
import { freshDatabase, rows } from './harness';

const VERSION = '2026-08-16';
const LIVE = { privacy: VERSION, terms: VERSION };
const IDS = {
  userId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  orgId: '11111111-1111-4111-8111-111111111111',
  consentIds: ['cccccccc-1111-4111-8111-cccccccccccc', 'cccccccc-2222-4222-8222-cccccccccccc'],
} as const;
const AT = Date.UTC(2026, 7, 16, 10, 30, 0);

/** A signup that has already passed the account layer, as one would arrive. */
function accepted(country = 'SA'): Accepted {
  const result = checkSignup(
    {
      email: 'Teacher@Example.SA',
      password: 'a very long passphrase indeed',
      country,
      language: 'ar',
      policyVersion: VERSION,
    },
    { languages: ['ar', 'en'], currentPolicyVersion: () => VERSION },
  );
  if (!result.ok) throw new Error(`fixture rejected: ${JSON.stringify(result.problems)}`);
  return result.account;
}

let client: PGlite;
let db: Database;

beforeEach(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
});

describe('the rows a signup becomes', () => {
  it('derives the regime from the country rather than taking it from the request', () => {
    const plan = planAccount(accepted('AE'), IDS, LIVE, AT);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.records.map((record) => record.regime)).toEqual(['ae', 'ae']);
    expect(plan.rows.user.country).toBe('AE');
  });

  it('records a consent to each document, each naming its version', () => {
    const plan = planAccount(accepted(), IDS, LIVE, AT);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.rows.consents.map((row) => row.document)).toEqual(['privacy', 'terms']);
    for (const row of plan.rows.consents) {
      expect(row.version).toBe(VERSION);
      expect(row.language).toBe('ar');
      expect(row.at).toEqual(new Date(AT));
    }
  });

  // Acceptance criterion 26. The form showed one version; if a document moved
  // on before the submit landed, recording agreement to the new one would be
  // recording agreement to a page nobody read.
  it('refuses when a document has moved on, and names which one', () => {
    const plan = planAccount(accepted(), IDS, { privacy: VERSION, terms: '2026-09-01' }, AT);
    expect(plan).toEqual({ ok: false, why: 'stale-consent', document: 'terms' });
  });
});

describe('the account in the database', () => {
  it('writes the organisation, the profile and both consents together', async () => {
    const result = await createAccount(db, accepted(), IDS, LIVE, AT);
    expect(result.ok).toBe(true);

    const orgs = await rows<{ owner_id: string }>(client, 'select owner_id from orgs');
    expect(orgs).toEqual([{ owner_id: IDS.userId }]);

    const users = await rows<{ email: string; country: string; org_id: string }>(
      client,
      'select email, country, org_id from users',
    );
    // Lowercased by the account layer, which is the one place that decides it.
    expect(users).toEqual([{ email: 'teacher@example.sa', country: 'SA', org_id: IDS.orgId }]);

    const consents = await rows<{ document: string; version: string; regime: string }>(
      client,
      'select document, version::text as version, regime from consents order by document',
    );
    expect(consents).toEqual([
      { document: 'privacy', version: VERSION, regime: 'sa' },
      { document: 'terms', version: VERSION, regime: 'sa' },
    ]);
  });

  it('writes nothing at all when the consent is stale', async () => {
    const result = await createAccount(
      db,
      accepted(),
      IDS,
      { privacy: '2026-01-01', terms: VERSION },
      AT,
    );
    expect(result.ok).toBe(false);
    const orgs = await rows<{ n: number }>(client, 'select count(*)::int as n from orgs');
    expect(orgs[0]?.n).toBe(0);
  });

  // One mailbox, one account. The uniqueness is the database's job because a
  // rule enforced only in application code is a rule with a race in it.
  it('refuses a second account for the same mailbox in any casing', async () => {
    await createAccount(db, accepted(), IDS, LIVE, AT);
    await expect(
      client.exec(
        `insert into users (id, org_id, email, locale, country)
         values ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', '${IDS.orgId}', 'TEACHER@EXAMPLE.SA', 'ar', 'SA')`,
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  // A signup retried after the network dropped must not file a second consent
  // to the same document. PLAN.md section 6 makes idempotency a rule for sync;
  // it costs nothing to keep it here too.
  it('cannot file the same consent twice', async () => {
    await createAccount(db, accepted(), IDS, LIVE, AT);
    await expect(
      client.exec(
        `insert into consents (id, org_id, user_id, document, regime, country, language, version, at)
         values ('cccccccc-3333-4333-8333-cccccccccccc', '${IDS.orgId}', '${IDS.userId}',
                 'privacy', 'sa', 'SA', 'ar', '${VERSION}', now())`,
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  // The version is a date column, not text, which is what makes "which policy
  // was live in March" an ordinary comparison rather than a string trick.
  it('refuses a policy version that is not a date', async () => {
    await createAccount(db, accepted(), IDS, LIVE, AT);
    await expect(
      client.exec(
        `insert into consents (id, org_id, user_id, document, regime, country, language, version, at)
         values ('cccccccc-4444-4444-8444-cccccccccccc', '${IDS.orgId}', '${IDS.userId}',
                 'terms', 'sa', 'SA', 'ar', 'v2', now())`,
      ),
    ).rejects.toThrow();
  });
});
