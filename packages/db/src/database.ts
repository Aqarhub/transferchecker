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

import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type Database = PgDatabase<PgQueryResultHKT>;
