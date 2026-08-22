// The class roster, and the smallest one this product is willing to hold.
//
// PLAN.md section 7 calls data minimisation the strongest protection we have and
// then spends it: no national id, no date of birth, no photograph, and the name
// itself optional. The serial number a teacher already writes on the sheet is
// enough to hand a paper back, so `name` is nullable and means it.

import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { isolate } from '../policy';
import { orgs } from './orgs';

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey(),

    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    /**
     * The identifier the school already uses, as text and never as a number.
     *
     * `00007` is not seven. `packages/grading` keeps leading zeros through the CSV
     * import and through the export, and a numeric column here would undo both at
     * the one point neither of them is looking.
     */
    extId: text('ext_id').notNull(),

    /** Optional, and the plan says so. A serial number identifies a paper. */
    name: text('name'),

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
    // What makes `scans.student_ext_id` mean anything. Two students sharing a
    // number in one organisation would silently split one pupil's papers in two.
    unique('students_ext_id').on(table.orgId, table.extId),
    // The delta pull filters on the organisation and walks the cursor.
    index('idx_students_org_synced').on(table.orgId, table.syncedAt),
    isolate('students'),
  ],
);
