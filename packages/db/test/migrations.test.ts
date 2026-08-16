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

  // The two the product actually depends on. A pupil with no name is a normal
  // roster entry, and a paper whose identity grid was unreadable is a normal
  // scan: forcing either one to be present means dropping data or inventing it.
  it('leaves exactly the two columns nullable that the product needs nullable', () => {
    const nullable = catalogue
      .filter((column) => column.is_nullable === 'YES')
      .map((column) => `${column.table_name}.${column.column_name}`);
    expect([...nullable].sort()).toEqual([
      'scans.student_ext_id',
      'students.name',
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
