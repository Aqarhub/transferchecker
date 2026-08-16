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

import { pgTable, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
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
  },
  () => [isolate('templates')],
);
