// One database type, deliberately not tied to a driver.
//
// Every query in this package takes a `Database` rather than importing a client,
// so the same code runs against the PostgreSQL that boots inside the test
// process and against a pooled connection to Supabase, and neither of them is a
// special case with a second code path nobody exercises.
//
// It also keeps the driver out of this package's dependencies. docs/TECH-STACK.md
// section 3 carries a warning that only bites at the moment a driver is chosen:
// through Supavisor's transaction mode on port 6543 prepared statements must be
// turned off, and migrations must run on the direct connection instead. That is
// a decision for whoever opens the connection, and this is why they still can.

import type { SQL } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

// The schema parameter is `Record<string, unknown>` rather than the default
// `Record<string, never>` because the two real drivers disagree: PGlite's
// drizzle instance types its (unused) full schema as `never` values and the
// postgres-js one as `unknown`, and only the wider of the two accepts both.
// Nothing in this package touches the relational query API the parameter
// feeds, so the widening changes what assigns, not what runs.
export type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/**
 * The two things a deployment check needs, and nothing more.
 *
 * Narrower than `Database` on purpose. The migration runner holds a concrete
 * driver type that the general one does not accept, and the check has no use
 * for the query builder anyway: it reads the system catalogue and opens one
 * transaction. Asking for exactly that lets it run against either.
 */
export interface Queryable {
  execute: (query: SQL) => Promise<unknown>;
  transaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
}
