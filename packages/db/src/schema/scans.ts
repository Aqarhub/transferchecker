// One graded paper, and the decision that this whole schema is built around.
//
// THERE IS NO `responses` TABLE. PLAN.md section 5 states it as a hard decision
// and shows the arithmetic: a million teachers, a hundred papers a month, fifty
// questions each is five billion rows a month. The answers live as ONE STRING in
// `answers`, item analysis is computed from those strings on demand, and the
// plan puts the saving at 95 percent of the database's size and cost.
//
// `marks` IS A COLUMN because acceptance criterion 19 asks for it in words: the
// record must come back field for field, "including the marks string". It was
// missing from the first sketch of this schema. `flags` was in that sketch and
// is deliberately gone: a warning count is derived from `marks` in full, and
// storing the derived value is the door to two answers disagreeing.
//
// AND THE STRING IS MEANINGLESS WITHOUT THE SHEET IT WAS READ FROM. Only the
// spec knows that index 2 was printed as `C`. That is safe because a printed
// sheet does not change: the paper carries its own version and the scan is bound
// to a template. It is stated here because it is a real cost, not a free win.

import { index, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { isolate } from '../policy';
import { exams } from './exams';
import { orgs } from './orgs';

export const scans = pgTable(
  'scans',
  {
    /**
     * A UUIDv7, generated on the device.
     *
     * Time ordered, so inserts land at the end of the B-tree instead of scattering
     * through it. Generated in the application rather than by the database for two
     * reasons that agree: Supabase runs PostgreSQL 17, whose `uuidv7()` does not
     * exist until 18, and an offline first client has to be able to name a row
     * before it has ever spoken to a server. The id doubles as the idempotency key
     * in PLAN.md section 6, so a batch replayed after a dropped connection lands on
     * the same rows instead of duplicating them.
     */
    id: uuid('id').primaryKey(),

    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id),

    /**
     * Nullable, and this is the unmatched paper.
     *
     * A sheet whose identity grid was smudged or left blank still has answers and
     * still has to be stored. Forcing an id here would mean either dropping that
     * paper or inventing a student for it, and inventing one is how a mark ends up
     * on the wrong pupil. It is left null and shown to the teacher to resolve.
     */
    studentExtId: text('student_ext_id'),

    /** One symbol per question. `0..9`, `?` for left blank, `!` for undecided. */
    answers: text('answers').notNull(),

    /** One letter per question, from the marks alphabet: c u d b e x. */
    marks: text('marks').notNull(),

    /** What the device scored it at the moment it read it. */
    score: real('score').notNull(),

    /** What it was out of then. Both are re-derivable from `answers` and the key. */
    total: real('total').notNull(),

    deviceId: text('device_id').notNull(),

    /** The device's own clock when it graded. Untrusted, and never used to order. */
    clientTs: timestamp('client_ts', { withTimezone: true }).notNull(),

    /** The server's clock when it arrived. This is the one that orders a list. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Both indexes are from the plan, and both lead with `org_id` because every
    // policy filters on it first: an index the policy cannot use turns isolation
    // into a sequential scan of the whole table.
    index('idx_scans_org_exam').on(table.orgId, table.examId),
    index('idx_scans_org_created').on(table.orgId, table.createdAt.desc()),
    isolate('scans'),
  ],
);
