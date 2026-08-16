// The class roster, and the smallest one this product is willing to hold.
//
// PLAN.md section 7 calls data minimisation the strongest protection we have and
// then spends it: no national id, no date of birth, no photograph, and the name
// itself optional. The serial number a teacher already writes on the sheet is
// enough to hand a paper back, so `name` is nullable and means it.

import { pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
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
  },
  (table) => [
    // What makes `scans.student_ext_id` mean anything. Two students sharing a
    // number in one organisation would silently split one pupil's papers in two.
    unique('students_ext_id').on(table.orgId, table.extId),
    isolate('students'),
  ],
);
