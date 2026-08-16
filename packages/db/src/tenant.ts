// How one request becomes a scoped session, which is where isolation is won or
// lost in application code.
//
// Every policy in this schema reads `auth.jwt()`. Nothing sets that by itself.
// On Supabase, PostgREST set it per request and that was the end of it; here the
// application server has to, and if it forgets, the policies evaluate against an
// empty claim and the client sees nothing. That failure is loud and safe.
//
// THE FAILURE THAT IS NEITHER LOUD NOR SAFE IS `SET` INSTEAD OF `SET LOCAL`.
// A connection pool hands the same physical connection to the next request. A
// plain `SET` outlives the transaction, so request two arrives on a connection
// still carrying request one's organisation, and one teacher reads another
// school's marks with every policy working exactly as written. `SET LOCAL` and
// `set_config(..., true)` are both transaction scoped and both revert on commit
// or rollback, which is why this function opens a transaction it does not
// strictly need. A test presents the leak and shows it does not happen.
//
// AND THE ROLE IS SWITCHED, NOT ONLY THE CLAIM. The connection logs in as an
// application role that owns nothing and is granted `authenticated`. Policies
// apply to a role, so a claim without the role switch is a claim nobody reads.

import { sql } from 'drizzle-orm';
import type { Database } from './database';

/** The verified token's contents, as a policy expects to find them. */
export interface Claims {
  /** The signed in user. Read by `auth.uid()`. */
  readonly userId: string;
  /**
   * The organisation, which goes in `app_metadata` and nowhere else.
   *
   * `user_metadata` is writable by the user through an auth API, so a claim
   * placed there is a claim the user chose. Every policy in this schema reads
   * `app_metadata`, and this is the other half of that decision.
   */
  readonly orgId: string;
}

/** The role a request runs as. Never the owner, and never a role that owns a table. */
export const REQUEST_ROLE = 'authenticated';

/**
 * Runs `work` as an ordinary signed in client of one organisation.
 *
 * Everything inside sees exactly what the policies admit and nothing else, and
 * everything outside is back to the connection's own role the moment the
 * transaction ends. That reset is not cleanup a caller can forget, because it is
 * PostgreSQL's, not ours.
 */
export function asTenant<T>(
  db: Database,
  claims: Claims,
  work: (tx: Database) => Promise<T>,
): Promise<T> {
  const payload = JSON.stringify({
    sub: claims.userId,
    role: REQUEST_ROLE,
    app_metadata: { org_id: claims.orgId },
  });

  return db.transaction(async (tx) => {
    // Claims first, then the role. Both are transaction scoped: the third
    // argument to `set_config` is `is_local`, and `set local role` is the same
    // promise in the other spelling.
    await tx.execute(sql`select set_config('request.jwt.claims', ${payload}, true)`);
    await tx.execute(sql.raw(`set local role ${REQUEST_ROLE}`));
    return work(tx);
  });
}

/**
 * The same, for a caller holding a token that names no organisation.
 *
 * A real state rather than a defensive branch: it is what a session looks like
 * between signing in and being placed in an organisation, and what a bug in
 * whatever mints tokens would produce. It must see nothing, and a test checks
 * that it sees nothing rather than everything.
 */
export async function asAnonymous<T>(db: Database, work: (tx: Database) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', '', true)`);
    await tx.execute(sql.raw('set local role anon'));
    return work(tx);
  });
}
