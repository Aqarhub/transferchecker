// The exam, which owns the whole lifecycle in PLAN.md section 5ب-1.
//
// Six metadata fields are enough for the screen, and four of them are here. The
// paper count and the question count are NOT columns: the first is a count of
// scans and the second is the length of the key, and both are derived for the
// same reason `Max. Points` is. A stored count is a count that can be wrong.

import { index, pgTable, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { isolate } from '../policy';
import { orgs } from './orgs';
import { templates } from './templates';

export const exams = pgTable(
  'exams',
  {
    id: uuid('id').primaryKey(),

    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    title: text('title').notNull(),

    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id),

    /**
     * How many printed forms this exam has, which is how many keys it can hold.
     *
     * PLAN.md section 5ب-4: one stack is printed and serves every version, and the
     * version bubble on each sheet picks which key applies.
     */
    formCount: integer('form_count').notNull(),

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
    index('idx_exams_org_synced').on(table.orgId, table.syncedAt),
    isolate('exams'),
  ],
);
