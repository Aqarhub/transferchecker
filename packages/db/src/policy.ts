// Row level isolation, which PLAN.md section 7 calls the most important item in
// the project: one leak ends it.
//
// THE RULE IS DENY BY DEFAULT AND IT IS THE DATABASE THAT KEEPS IT. Enabling row
// level security on a table with no policy denies everything to everybody, so
// isolation is not something a query has to remember to ask for. A missing
// `where org_id = ...` in application code then returns nothing rather than
// returning somebody else's class.
//
// FOUR THINGS IN THE PREDICATE ARE DELIBERATE, and three of them are from the
// performance note in docs/TECH-STACK.md section 3:
//
//   1. `app_metadata`, never `user_metadata`. A user can write their own
//      `user_metadata` through the auth API, so a policy that trusts it lets
//      anybody assign themselves any org. `app_metadata` is writable only with
//      the service key. This is the single most dangerous line in the file.
//   2. `(select auth.jwt() ...)`, wrapped. The wrap turns a per row function
//      call into one initplan evaluated once per query. Supabase measured the
//      difference at up to 99.99 percent on large tables.
//   3. `to authenticated`, always. Without it the policy is also evaluated for
//      `anon`, which wastes the planner's time on a role that must see nothing.
//   4. `with check` written out, though on a `for all` policy PostgreSQL would
//      supply it. [measured] Dropping the clause from `scans_isolation` and
//      retrying the cross organisation insert still refused it: on a `for all`
//      policy an omitted `with check` falls back to the `using` expression, so
//      the two are the same predicate here whether or not it is typed.
//      It is typed anyway, and the reason is the mutation that comes next
//      rather than the one that exists now: `using (true) with check (org_id =
//      ...)` refuses the write while `using (true)` alone ALLOWS IT [measured].
//      The day somebody widens the read rule for a shared template or a
//      read only institution view, the write rule has to stay where it is, and
//      a predicate that was never written down is a predicate that widens with
//      it silently.

import { sql } from 'drizzle-orm';
import { pgPolicy } from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';

/**
 * The caller's organisation, read from the verified access token.
 *
 * Written to `app_metadata` by the Custom Access Token Hook. Not a parameter,
 * not a session variable the client can set, and not a column the client sends:
 * the token is signed, so this is the one claim about identity the database can
 * act on without trusting the request body.
 */
export const CURRENT_ORG = sql`(select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid)`;

/**
 * The isolation policy for one table, named after it.
 *
 * `column` is the raw name of the column carrying the organisation, which is
 * `org_id` everywhere except `orgs` itself, where the organisation IS the row.
 */
export function isolateBy(table: string, column: string) {
  return pgPolicy(`${table}_isolation`, {
    as: 'permissive',
    for: 'all',
    to: authenticatedRole,
    using: sql`${sql.identifier(column)} = ${CURRENT_ORG}`,
    withCheck: sql`${sql.identifier(column)} = ${CURRENT_ORG}`,
  });
}

/** The usual case: a table with its own `org_id`. */
export const isolate = (table: string) => isolateBy(table, 'org_id');
