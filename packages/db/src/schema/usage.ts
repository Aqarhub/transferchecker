// The paper counter, one row per organisation per month.
//
// PLAN.md section 12 decided the counter is LOCAL FIRST and accepts, in writing,
// that somebody who stays offline on purpose gets past it. That decision is what
// this table is shaped by: it is a copy of a number the device already holds,
// synced when there is a network, and it is never the gate. A mandatory online
// check would break the product's own promise that a phone with no signal still
// grades a stack of papers.
//
// So `synced_at` is nullable and means "never reached us", which is a normal
// state here rather than an error.

import { pgTable, date, integer, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { isolate } from '../policy';
import { orgs } from './orgs';

export const usage = pgTable(
  'usage',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    /** The first of the month it counts, so a month is one comparable value. */
    month: date('month').notNull(),

    papersGraded: integer('papers_graded').notNull().default(0),

    syncedAt: timestamp('synced_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.orgId, table.month] }), isolate('usage')],
);
