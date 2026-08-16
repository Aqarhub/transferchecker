// Refresh token rotation, as rows. The state machine itself is elsewhere.
//
// `packages/account/src/session.ts` owns the rules and proves them exhaustively
// without a database: reuse is checked before expiry, and a token presented
// twice kills its whole family. What it never had was anywhere to put the
// tokens, because the plan assumed Supabase would hold them. It does not hold
// them here, so they live in these two tables.
//
// THE TOKEN ITSELF IS NEVER STORED. `refresh_tokens.id` is the SHA-256 of the
// token, hex encoded. The account layer says of its own field that it is "the
// token itself, or a hash of it, this layer does not care which" and leaves the
// choice to whoever owns storage. This is that owner, and the choice is the
// hash: a leaked backup of a table of raw refresh tokens is every live session
// stolen at once, while a table of hashes is worth nothing to whoever reads it.
//
// AND A FAMILY IS REVOKED RATHER THAN DELETED. Acceptance criterion 24 says a
// token used twice invalidates its whole family, and the row that records WHY
// is the only evidence a theft ever happened. Deleting it would log the real
// user out just the same and leave nobody able to say what occurred.

import { sql } from 'drizzle-orm';
import { index, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';
import { CURRENT_ORG } from '../policy';
import { orgs } from './orgs';
import { users } from './users';

/** Why a family stopped being usable. `reuse` is the one that matters. */
export const REVOCATIONS = ['reuse', 'signed-out', 'password-changed'] as const;

export const tokenFamilies = pgTable(
  'token_families',
  {
    /** One family per login. Every token descended from it shares this id. */
    id: uuid('id').primaryKey(),

    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),

    /**
     * What the person would recognise this session as, for a sessions screen.
     *
     * Deliberately not a user agent string and not an IP address: PLAN.md
     * section 7 makes data minimisation the strongest protection we have, and
     * "Pixel 8a" tells the owner which session to end while telling a leak
     * nothing about where anybody was.
     */
    deviceLabel: text('device_label'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** Null while the family is live. Set once, never unset. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    /** One of REVOCATIONS. The evidence, kept rather than deleted. */
    revokedReason: text('revoked_reason'),
  },
  (table) => [
    index('idx_token_families_user').on(table.orgId, table.userId),
    // TIGHTER THAN THE USUAL ISOLATION, on purpose. Everywhere else the rule is
    // "same organisation". Here it is "same organisation AND you". A teacher may
    // see and end their own sessions; nobody may see a colleague's, and the
    // institution tier is exactly where that difference stops being theoretical.
    pgPolicy('token_families_own', {
      as: 'permissive',
      for: 'all',
      to: authenticatedRole,
      using: sql`${sql.identifier('org_id')} = ${CURRENT_ORG} and ${sql.identifier('user_id')} = auth.uid()`,
      withCheck: sql`${sql.identifier('org_id')} = ${CURRENT_ORG} and ${sql.identifier('user_id')} = auth.uid()`,
    }),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    /** SHA-256 of the token, hex. The token itself never reaches this column. */
    id: text('id').primaryKey(),

    familyId: uuid('family_id')
      .notNull()
      .references(() => tokenFamilies.id),

    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Set when exchanged for a successor. Presenting a used token is the alarm. */
    usedAt: timestamp('used_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Revoking a family reaches every token in it, so this is the hot path of
    // the one operation that has to be fast while a theft is in progress.
    index('idx_refresh_tokens_family').on(table.familyId),
  ],
  // NO POLICY, AND THAT IS THE ENTRY. Row level security is turned on by
  // `enableRLS` below and no policy is written for any client role, which in
  // PostgreSQL means every client is denied every row. Nothing a signed in
  // client does needs to read a refresh token: the token is presented to the
  // auth endpoint, which runs server side. Deny by default is usually the
  // fallback nobody relies on; here it is the whole design, and the grants
  // migration gives `authenticated` no privilege on this table either.
).enableRLS();
