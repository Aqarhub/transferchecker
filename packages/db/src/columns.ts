// Column types Postgres has and Drizzle does not ship a builder for.

import { customType, timestamp } from 'drizzle-orm/pg-core';

/**
 * A case insensitive text column, which is what an email address needs.
 *
 * PLAN.md section 5 names `citext` for `users.email` by name, and the reason is
 * that case folding an address anywhere else is a rule somebody eventually
 * forgets. `Ahmed@school.sa` and `ahmed@school.sa` are one mailbox, so they have
 * to be one row, and the unique index has to know that. Lowercasing on the way
 * in works right up until one code path does not, and then two accounts exist.
 *
 * The extension is created by the first migration. It ships with both Supabase
 * and stock PostgreSQL, so this costs nothing at either end.
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType: () => 'citext',
});

/**
 * The two clocks a synced row carries, and they are not the same clock.
 *
 * `updated_at` IS THE SERVER'S AND IS THE ONLY THING A CURSOR MAY READ. Delta
 * sync hands a client "everything changed since X", and if X were compared
 * against a value a device chose, then a device whose clock is a day slow would
 * write rows that every cursor has already passed, and they would never be
 * delivered to anybody, ever, with nothing reporting it.
 *
 * `client_ts` IS THE DEVICE'S AND DECIDES WHICH VERSION WINS. PLAN section 6
 * settles the conflict rule as last writer wins by timestamp, and the timestamp
 * that means anything there is when the teacher actually made the edit, not when
 * the phone next found a network. Without it, a device that was offline for a
 * week overwrites a newer edit the moment it reconnects, silently.
 *
 * So one orders delivery and the other orders truth. Collapsing them into one
 * column breaks whichever job it is not doing.
 */
export const syncColumns = {
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  clientTs: timestamp('client_ts', { withTimezone: true }).notNull().defaultNow(),
};
