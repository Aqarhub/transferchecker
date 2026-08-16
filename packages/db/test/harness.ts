// A database per test file, built the only way production will be built.
//
// Nothing here creates a table. The migrations do that, and if a migration is
// wrong every test in the package fails, which is the point: the files that will
// be applied to the real database are the files under test.

import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { drizzle } from 'drizzle-orm/pglite';
import { prepare } from '../src/local';
import type { Database } from '../src/database';

export interface Harness {
  readonly client: PGlite;
  readonly db: Database;
}

/** Organisation A, and the neighbour whose rows must never be reachable. */
export const ORG_A = '11111111-1111-4111-8111-111111111111';
export const ORG_B = '22222222-2222-4222-8222-222222222222';
export const USER_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
export const USER_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

export async function freshDatabase(): Promise<Harness> {
  // `citext` has to be handed to the engine as an extension before the first
  // migration can create it, which is the one thing Supabase does for us and a
  // WebAssembly build cannot.
  const client = await PGlite.create({ extensions: { citext } });
  await prepare(client);
  return { client, db: drizzle(client) };
}

/** Raw rows, for the checks that ask the catalogue about itself. */
export async function rows<T>(client: PGlite, query: string, params: unknown[] = []): Promise<T[]> {
  const result = await client.query<T>(query, params);
  return result.rows;
}
