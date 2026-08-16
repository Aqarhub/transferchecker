// The password, and the counter that throttles guesses at it.
//
// TWO TABLES BECAUSE THEY ANSWER TO DIFFERENT MOMENTS. `credentials` belongs to
// an account that exists. `login_attempts` has to exist for an email nobody has
// ever registered, or the mere presence of throttling would answer the question
// of who has an account here, which is the leak the whole login path is written
// around.
//
// NEITHER IS REACHABLE BY ANY CLIENT. Both have row level security on, no policy
// for any role, and no privilege granted in the grants migration. That is the
// same statement `refresh_tokens` makes and for the same reason: nothing a
// signed in teacher does requires reading a password hash or a failure counter.
// A password is verified by the auth endpoint, which runs on the server.

import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

export const credentials = pgTable(
  'credentials',
  {
    /** One row per account, so the primary key is the account. */
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),

    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    /**
     * Argon2id in PHC form, parameters included.
     *
     * `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<digest>`. The cost sits inside the
     * string, which is what lets the cost be raised later without invalidating a
     * single existing password: an old hash still verifies against the
     * parameters it was made with, and is rewritten at the next successful sign
     * in. A bare digest column would have forced everybody to reset.
     */
    passwordHash: text('password_hash').notNull(),

    /**
     * When the mailbox was confirmed. Null while it is not.
     *
     * PLAN.md section 7 requires confirmation before cloud sync and not before
     * signing in, so this gates syncing and never the login itself. A teacher
     * grades a stack of papers on a phone that has never had a network.
     */
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),

    /** When the password was last set. Shown to the owner, never to anybody else. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [],
).enableRLS();

export const loginAttempts = pgTable(
  'login_attempts',
  {
    /**
     * The SHA-256 of the lowercased email, and never the email.
     *
     * Two reasons, and the second is the one that matters. It keeps a table of
     * addresses out of the database, which is data minimisation applied to data
     * we were never asked for. And it lets a row exist for an address with no
     * account without that row being a list of who tried to sign in.
     */
    emailHash: text('email_hash').primaryKey(),

    /** Consecutive failures since the last success. Reset to zero on success. */
    failures: integer('failures').notNull().default(0),

    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  },
  (table) => [
    // NO `org_id`, WHICH IS THE ONE EXCEPTION IN THIS SCHEMA AND IS DELIBERATE.
    // Every other table carries one because every row belongs to somebody. This
    // row exists BEFORE anybody is anybody: it is written for an address that
    // may have no account, by a caller who has presented no token. There is no
    // organisation to attribute it to, and inventing one would be a lie in a
    // column. The isolation it would have provided is provided instead by the
    // table being unreachable by every client role.
    index('idx_login_attempts_stale').on(table.lastFailureAt),
  ],
).enableRLS();
