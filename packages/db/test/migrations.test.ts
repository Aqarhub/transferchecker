// Whether the migrations build the schema the code thinks it is querying.
//
// The two can drift in one direction and stay green everywhere else: a column
// added to a Drizzle table but never generated into a migration typechecks, and
// every test that only reads the table definitions agrees with it. The database
// is the one that disagrees, and it does so at run time in production.
//
// So this applies the real migration files to a real engine and compares what
// the catalogue then contains against what the schema declares, column by
// column, in both directions.

import { getTableColumns, getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '../src/schema/index';
import { freshDatabase, rows } from './harness';

// See the note in schema.test.ts: the base table type is what lets the column
// helpers resolve instead of collapsing to `any` across a nine way union.
const tables: readonly PgTable[] = Object.values(schema);

let client: PGlite;

interface CatalogColumn {
  readonly table_name: string;
  readonly column_name: string;
  readonly is_nullable: 'YES' | 'NO';
}

let catalogue: CatalogColumn[] = [];

beforeAll(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  catalogue = await rows<CatalogColumn>(
    client,
    `select table_name, column_name, is_nullable from information_schema.columns
     where table_schema = 'public' order by table_name, column_name`,
  );
});

describe('the migrations and the schema describe the same database', () => {
  it('creates every column the schema declares, and no column it does not', () => {
    for (const table of tables) {
      const name = getTableName(table);
      const declared = Object.values(getTableColumns(table)).map((column) => column.name);
      const built = catalogue
        .filter((column) => column.table_name === name)
        .map((column) => column.column_name);
      expect([name, [...built].sort()]).toEqual([name, [...declared].sort()]);
    }
  });

  it('agrees with the schema about which columns may be null', () => {
    for (const table of tables) {
      const name = getTableName(table);
      for (const column of Object.values(getTableColumns(table))) {
        const built = catalogue.find(
          (entry) => entry.table_name === name && entry.column_name === column.name,
        );
        const nullable = built?.is_nullable === 'YES';
        expect([name, column.name, nullable]).toEqual([name, column.name, !column.notNull]);
      }
    }
  });

  // Every nullable column, listed, because each one is a state the product has
  // decided is normal rather than a field somebody forgot to constrain. A pupil
  // with no name is a normal roster entry, a paper whose identity grid was
  // unreadable is a normal scan, and a live session is one whose `revoked_at` is
  // still empty. Forcing any of them to be present means dropping data or
  // inventing it.
  it('leaves exactly the columns nullable that the product needs nullable', () => {
    const nullable = catalogue
      .filter((column) => column.is_nullable === 'YES')
      .map((column) => `${column.table_name}.${column.column_name}`);
    expect([...nullable].sort()).toEqual([
      'credentials.confirmed_at',
      'login_attempts.last_failure_at',
      'refresh_tokens.used_at',
      // NULL is the no-version-box state, one of the column's three. A sheet
      // that prints no box has nothing to say, and forcing a value here would
      // mean inventing a form for every quick20 in the product.
      'scans.form',
      'scans.student_ext_id',
      'students.name',
      'token_families.device_label',
      'token_families.revoked_at',
      'token_families.revoked_reason',
      'usage.synced_at',
    ]);
  });

  it('applies every migration file the journal lists', async () => {
    const counted = await rows<{ n: number }>(
      client,
      `select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    expect(counted[0]?.n).toBe(tables.length);
    // The bootstrap migration ran, or `citext` would not be a known type.
    const extension = await rows<{ n: number }>(
      client,
      `select count(*)::int as n from pg_extension where extname = 'citext'`,
    );
    expect(extension[0]?.n).toBe(1);
  });
});
