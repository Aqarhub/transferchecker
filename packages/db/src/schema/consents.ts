// The consent log, which is the evidence half of `packages/account`.
//
// Acceptance criterion 26 in PLAN.md section 8ج: "consent is recorded with its
// version, and a consent to a document that was not the live one at the time is
// not accepted". `consentFor` in the account package builds the record and
// refuses to build one without a version. This is where that record lands.
//
// THE VERSION IS A DATE COLUMN, NOT TEXT. The plan argues the version should be
// a date because a date sorts and answers "which one was live in March" without
// a lookup table. Typing the column `date` is what makes that argument true in
// the database rather than only in the encoding: `2026-13-40` is rejected on
// write, and "the consents held under the policy that was live on any given
// day" is an ordinary range query.
//
// AND THE REGIME IS STORED HERE, WHICH IS THE OPPOSITE OF `users`. There it is
// derived, because a profile describes the present. Here it is a historical
// fact: this person agreed under this law, on this day. If a country is ever
// remapped to a different regime, every profile should follow and no consent
// record may, because the record is about what was true when it was signed.

import { pgTable, char, date, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { isolate } from '../policy';
import { orgs } from './orgs';
import { users } from './users';

export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey(),

    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),

    /** `privacy` or `terms`. Two agreements, recorded separately. */
    document: text('document').notNull(),

    /** Which law the document was written against on the day it was agreed. */
    regime: text('regime').notNull(),

    /** The country they chose, which is what selected the regime. */
    country: char('country', { length: 2 }).notNull(),

    /** The language they read it in, because they agreed to what they read. */
    language: char('language', { length: 2 }).notNull(),

    version: date('version').notNull(),

    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // One agreement per person per document per version. A signup retried after
    // the network dropped writes the same three values and lands on the same row,
    // which is the idempotency rule in PLAN.md section 6 applied where it costs
    // nothing: without it a retry would file a second consent to the same
    // document, and a duplicated consent log is a log nobody can read as evidence.
    unique('consents_once').on(table.userId, table.document, table.version),
    isolate('consents'),
  ],
);
