// Where `packages/account` meets the database.
//
// The account package settles what an account IS: which countries are offered,
// what makes a password acceptable, which regime a country sits under, and what
// a consent record has to name. All of it is pure, none of it has ever seen a
// row, and 41 tests cover the edges. What was missing was the wire, and this is
// the wire. No rule is restated here, and that is the whole design: a second
// copy of "is this country offered" living next to an INSERT is how the two
// answers start disagreeing.
//
// THREE ROWS AND ONE TRANSACTION. An organisation, a profile, and a consent per
// document. They are written together because an account that exists without its
// consent record is an account we cannot show consent for, which under every
// regime in `REGIME_LAW` is the same as no consent at all.
//
// AND THIS IS THE ONE WRITE THAT CANNOT GO THROUGH ROW LEVEL SECURITY. Every
// policy in this schema asks whether the caller's token names this organisation.
// At signup the organisation does not exist yet, so no token can name it, and
// there is no ordering of these three inserts that fixes that. Signup runs on the
// server with the service key. It is the only thing that does, and the reason is
// structural rather than a convenience.

import { consentFor, regimeOf } from '@transferchecker/account';
import type { Accepted, Consent } from '@transferchecker/account';
import { consents } from './schema/consents';
import { orgs } from './schema/orgs';
import { users } from './schema/users';
import type { Database } from './database';

/** The live version of each document, for the regime the signup landed in. */
export interface LiveVersions {
  readonly privacy: string;
  readonly terms: string;
}

export interface SignupIds {
  readonly userId: string;
  readonly orgId: string;
  /** One id per consent row, in document order: privacy, then terms. */
  readonly consentIds: readonly [string, string];
}

export interface AccountRows {
  readonly org: typeof orgs.$inferInsert;
  readonly user: typeof users.$inferInsert;
  readonly consents: readonly (typeof consents.$inferInsert)[];
}

export type AccountPlan =
  | { readonly ok: true; readonly rows: AccountRows; readonly records: readonly Consent[] }
  /** The person agreed to a version that is not the live one for that document. */
  | { readonly ok: false; readonly why: 'stale-consent'; readonly document: 'privacy' | 'terms' };

/**
 * The rows a validated signup turns into, without writing any of them.
 *
 * Separated from the insert so the decision is testable without a database, the
 * way the rest of the account layer is. `checkSignup` has already decided the
 * signup is acceptable; what is left is a mapping, and one refusal.
 *
 * THE REFUSAL IS ACCEPTANCE CRITERION 26. A consent to a document that was not
 * the live one at the time is not recorded. The account layer checked the
 * version the form showed against the regime's current one, and this checks it
 * again per document, because the two documents version independently and a
 * signup form showing a stale terms page would otherwise file a consent to a
 * document nobody is operating under.
 */
export function planAccount(
  accepted: Accepted,
  ids: SignupIds,
  live: LiveVersions,
  at: number,
): AccountPlan {
  // The form showed one version and the person agreed to what they read. If a
  // document has moved on since it was rendered, the honest answer is to refuse
  // and show the new one, not to file a consent against a page nobody saw.
  const documents = [
    { name: 'privacy', id: ids.consentIds[0] },
    { name: 'terms', id: ids.consentIds[1] },
  ] as const;
  for (const document of documents) {
    if (accepted.policyVersion !== live[document.name]) {
      return { ok: false, why: 'stale-consent', document: document.name };
    }
  }

  // Derived here rather than trusted from the caller, exactly as `checkSignup`
  // derives it: the regime decides which law this account sits under, and a
  // value that arrived with the request is a value the client chose.
  const regime = regimeOf(accepted.country);

  const written = documents.map((document) => ({
    id: document.id,
    record: consentFor({
      userId: ids.userId,
      document: document.name,
      regime,
      country: accepted.country,
      language: accepted.language,
      version: live[document.name],
      at,
    }),
  }));

  return {
    ok: true,
    records: written.map((entry) => entry.record),
    rows: {
      org: { id: ids.orgId, ownerId: ids.userId },
      user: {
        id: ids.userId,
        orgId: ids.orgId,
        email: accepted.email,
        locale: accepted.language,
        country: accepted.country,
      },
      consents: written.map((entry) => ({
        id: entry.id,
        orgId: ids.orgId,
        userId: entry.record.userId,
        document: entry.record.document,
        regime: entry.record.regime,
        country: entry.record.country,
        language: entry.record.language,
        version: entry.record.version,
        at: new Date(entry.record.at),
      })),
    },
  };
}

/**
 * Writes the three rows, or none of them.
 *
 * One transaction, because the failure this guards against is not a crash but a
 * half account: an organisation with no owner profile, or a profile with no
 * consent. Both are states no screen and no audit knows how to read.
 */
export async function createAccount(
  db: Database,
  accepted: Accepted,
  ids: SignupIds,
  live: LiveVersions,
  at: number,
): Promise<AccountPlan> {
  const plan = planAccount(accepted, ids, live, at);
  if (!plan.ok) return plan;
  await db.transaction(async (tx) => {
    await tx.insert(orgs).values(plan.rows.org);
    await tx.insert(users).values(plan.rows.user);
    await tx.insert(consents).values([...plan.rows.consents]);
  });
  return plan;
}
