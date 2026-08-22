// The answer key, stored exactly as PLAN.md section 5 settled it.
//
// FOUR COLUMNS AND NO ROW PER QUESTION. The overwhelmingly common question has
// one answer worth one point, so the common case costs one character in `key`
// and one float in `points`. A question with alternates or a negative award pays
// for itself alone, in `extras`, and a sheet that uses none of them stores none.
//
// `key` IS IN THE SAME ENCODING AS A PAPER, which is the bubble's index and not
// its letter. `packages/grading` owns that encoding and the reason for it: a
// letter cannot hold a two character symbol and has no room at all for a
// `select: 'many'` question, so a key and a paper are never compared across two
// alphabets.
//
// AND `max_points` IS NOT HERE. It is the highest entry in a question's own
// table, derived by `maxPointsOf`. The plan names this one directly: it is shown
// because a teacher needs to know a question's ceiling, and it is not stored
// because storing what can be computed opens a door to two answers disagreeing.

import {
  pgTable,
  char,
  index,
  jsonb,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { StoredKey } from '@transferchecker/grading';
import { isolate } from '../policy';
import { exams } from './exams';
import { orgs } from './orgs';

export const answerKeys = pgTable(
  'answer_keys',
  {
    id: uuid('id').primaryKey(),

    /**
     * Carried here rather than reached through `exams`.
     *
     * The plan's own opening line for this section is that every table has an
     * `org_id`, and a policy that had to join to `exams` to find one would be a
     * subquery per row on the hot path of every read.
     */
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id),

    /** Which printed form, from the sheet's own version bubble. */
    formCode: char('form_code', { length: 1 }).notNull(),

    /** The intended answers, one symbol per question, in the paper's encoding. */
    key: text('key').notNull(),

    /** Points for the intended answer of each question. Dense: every question has one. */
    points: real('points').array().notNull(),

    /** Sparse. `{"6":[{"index":2,"points":0.5},{"index":3,"points":-0.25}]}` */
    extras: jsonb('extras').$type<StoredKey['extras']>().notNull(),

    /** Sparse. `{"6":["كسور","معيار-3.2"]}`, with a GIN index for the tag report. */
    tags: jsonb('tags').$type<StoredKey['tags']>().notNull(),

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
    // One key per form per exam. Without it a second key for form A can be
    // written, and grading would then pick whichever row came back first.
    unique('answer_keys_form').on(table.examId, table.formCode),
    // The plan asks for the tags to be reachable without a table per question.
    // "How did my class do on fractions" is then a containment lookup on this
    // index rather than a scan of every key in the organisation.
    index('answer_keys_tags').using('gin', table.tags),
    index('answer_keys_org').on(table.orgId),
    // The delta pull filters on the organisation and walks the cursor.
    index('idx_answer_keys_org_synced').on(table.orgId, table.syncedAt),
    isolate('answer_keys'),
  ],
);
