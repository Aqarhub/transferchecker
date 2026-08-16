// The teacher's profile, and the one field on it that is a legal fact.
//
// PLAN.md section 5 lists `users(id, email citext unique, locale, created_at)`.
// Two columns are added here and both are named by the plan elsewhere:
//
// `org_id`, because the same section opens with "every table has org_id for
// isolation from day one" and then omits it from this line. The rule is what
// the isolation depends on, so the rule wins over the sketch.
//
// `country`, because PLAN.md section 8ج says it is chosen explicitly at signup,
// stored on the profile, and decides which policy the person reads, where their
// data is processed, which currency bills them and which calendar they see.
//
// AND THE REGIME IS NOT STORED. It is `regimeOf(country)`, and the plan's own
// rule about `Max. Points` applies to it exactly: storing what can be derived
// opens a door to two answers disagreeing. The day a country's regime mapping
// changes, one derived function changes and every profile is already correct; a
// stored copy would need a migration nobody would remember to write. The
// consent record is the deliberate exception, and the reason it is one is
// written in its own file.

import { pgTable, char, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { citext } from '../columns';
import { isolate } from '../policy';
import { orgs } from './orgs';

export const users = pgTable(
  'users',
  {
    /**
     * The same uuid as the row in Supabase's `auth.users`.
     *
     * Shared rather than mapped, so `auth.uid()` in a policy and this primary key
     * are the same value and no join is needed to connect a token to a profile.
     */
    id: uuid('id').primaryKey(),

    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    /** Case insensitive, so one mailbox cannot become two accounts. */
    email: citext('email').notNull().unique(),

    /** The language the interface is drawn in. A preference, unlike the country. */
    locale: text('locale').notNull(),

    /**
     * ISO 3166-1 alpha-2, chosen at signup and never guessed from an IP address.
     *
     * An IP guess is wrong for anybody on a VPN and anybody travelling, and this
     * field decides a LAW rather than a language.
     */
    country: char('country', { length: 2 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [isolate('users')],
);
