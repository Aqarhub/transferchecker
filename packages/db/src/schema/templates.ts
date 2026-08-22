// A saved sheet layout, held as the spec object itself.
//
// `jsonb` rather than columns, because the shape of a `SheetSpec` is owned by
// `packages/sheet-spec` and validated by zod there. Spreading it across columns
// would put a second, weaker copy of that schema in the migration history, and
// the two would drift the first time a sheet field is added.
//
// The scanner never reads this table. A printed sheet carries its whole geometry
// in its own code, which is what lets a phone that has never seen the template
// grade a paper offline. This row is for showing a teacher a list of the sheets
// they have made and for printing another copy.

import { index, pgTable, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
import { isolate } from '../policy';
import { orgs } from './orgs';

export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey(),

    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    /** The `SheetSpec`, as `packages/sheet-spec` defines and validates it. */
    spec: jsonb('spec').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * The device's clock when the teacher last edited this row. Last write
     * wins compares THIS, per PLAN.md section 6, and it never orders a list.
     * The default only covers rows born on the server, like the seed's.
     */
    clientTs: timestamp('client_ts', { withTimezone: true }).notNull().defaultNow(),

    /** The server's clock when sync last wrote this row. The pull cursor. */
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The delta pull filters on the organisation and walks the cursor.
    index('idx_templates_org_synced').on(table.orgId, table.syncedAt),
    isolate('templates'),
  ],
);
