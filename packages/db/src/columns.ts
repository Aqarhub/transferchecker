// Column types Postgres has and Drizzle does not ship a builder for.

import { customType } from 'drizzle-orm/pg-core';

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
