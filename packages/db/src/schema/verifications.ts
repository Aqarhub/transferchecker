// The confirmation link, as a row. The rules are in `packages/account`.
//
// PLAN.md section 7 requires a confirmed mailbox before cloud sync. The flag it
// sets already exists, on `credentials.confirmed_at`; what was missing was
// anything that could set it, because the plan assumed an auth provider would
// own the mail. It does not own it here.
//
// THE LINK ITSELF IS NEVER STORED, exactly as with a refresh token: `id` is the
// SHA-256 of the secret in the URL. A leaked backup of this table is a list of
// hashes, and a hash cannot be pasted into a browser.
//
// AND THE ADDRESS IS STORED BESIDE IT, which is the column that is easy to leave
// out and is the whole security property. A link proves control of the mailbox
// it was sent to. If the profile's address changes after the mail goes out and
// the link is redeemed anyway, then proving control of the OLD mailbox has
// marked the NEW one as confirmed, and confirmation has stopped meaning
// anything. Keeping the address the mail went to lets redemption refuse that.

import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { citext } from '../columns';
import { orgs } from './orgs';
import { users } from './users';

export const emailVerifications = pgTable(
  'email_verifications',
  {
    /** SHA-256 of the secret in the link, hex. The secret never reaches a column. */
    id: text('id').primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),

    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    /**
     * The address the mail was sent to, case insensitive like the profile's.
     *
     * Compared against the profile at redemption. See the note at the top: this
     * is what stops one mailbox from confirming another.
     */
    email: citext('email').notNull(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Set when redeemed. A link is good once. */
    usedAt: timestamp('used_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // BY PERSON AND THEN BY TIME, which is not the shape every other index in
    // this schema has. The others lead with `org_id` because a client reads them
    // through a policy that filters on it. Nothing reads this one through a
    // policy: the two queries it serves are "how many links has this person been
    // sent lately" and "which was the oldest", both by `user_id`. Leading with a
    // column no query filters on would make the index unusable for both.
    index('idx_email_verifications_user').on(table.userId, table.createdAt),
  ],
  // NO POLICY, AND NO PRIVILEGE EITHER. The fourth table in this schema that
  // reaches nobody. Row level security is on with no policy for any client role,
  // which in PostgreSQL denies every row to everybody, and the migration
  // withholds the table privilege as well. Redemption happens at an endpoint
  // that runs on the server; nothing a signed in teacher does needs to read a
  // link that has not been clicked yet.
).enableRLS();
