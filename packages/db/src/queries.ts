// The reads the dashboard is built from.
//
// EVERY ONE OF THEM FILTERS ON `org_id` EVEN THOUGH A POLICY ALREADY DOES. That
// is the advice in docs/TECH-STACK.md section 3 and it is not belt and braces:
// the policy is a predicate the planner applies after choosing an access path,
// while an explicit filter is what lets it choose the `org_id` leading index in
// the first place. It also means these functions are correct when run with the
// service key, which bypasses row level security entirely.
//
// AND THE SCORE IS RECOMPUTED RATHER THAN READ. `scans.score` is what the device
// calculated at the moment it read the paper. The dashboard shows what the key
// says NOW, because the plan's own reason for storing answers as strings is that
// a teacher who fixes a badly worded question re-grades the class without
// rescanning anything. Reading the stored score would show the old answer and
// quietly undo the feature.

import { and, asc, desc, eq } from 'drizzle-orm';
import type { AnswerKey, Student } from '@transferchecker/grading';
import { keyOf } from './keys';
import { answerKeys } from './schema/answer-keys';
import { exams } from './schema/exams';
import { scans } from './schema/scans';
import { students } from './schema/students';
import type { Database } from './database';

export interface ExamSummary {
  readonly id: string;
  readonly title: string;
  readonly formCount: number;
  readonly createdAt: Date;
}

export interface ScanRecord {
  readonly id: string;
  readonly studentExtId: string | null;
  readonly answers: string;
  readonly marks: string;
  /** What the device scored it at, kept for comparison and never displayed. */
  readonly deviceScore: number;
  readonly createdAt: Date;
}

export interface ExamData {
  readonly exam: ExamSummary;
  readonly key: AnswerKey;
  readonly roster: readonly Student[];
  readonly scans: readonly ScanRecord[];
}

/** Every exam in an organisation, newest first, which is the list screen. */
export async function examsOf(db: Database, orgId: string): Promise<ExamSummary[]> {
  const rows = await db
    .select({
      id: exams.id,
      title: exams.title,
      formCount: exams.formCount,
      createdAt: exams.createdAt,
    })
    .from(exams)
    .where(eq(exams.orgId, orgId))
    .orderBy(desc(exams.createdAt));
  return rows;
}

/** The class roster, ordered by the identifier the school uses. */
export async function rosterOf(db: Database, orgId: string): Promise<Student[]> {
  const rows = await db
    .select({ id: students.extId, name: students.name })
    .from(students)
    .where(eq(students.orgId, orgId))
    .orderBy(asc(students.extId));
  // A name is optional in the schema and the interface must not print "null".
  // The serial number is what identifies a paper, so an unnamed pupil shows as
  // their number rather than as a blank row.
  return rows.map((row) => ({ id: row.id, name: row.name ?? row.id }));
}

/**
 * One exam with everything the screens need, or null if it is not readable.
 *
 * Null covers three different situations on purpose: the exam does not exist,
 * it belongs to another organisation and the policy hid it, or its key row is
 * malformed. A caller cannot tell them apart, and should not: telling a client
 * that a row it may not read exists is itself a small leak.
 */
export async function examDataOf(
  db: Database,
  orgId: string,
  examId: string,
  form = 'A',
): Promise<ExamData | null> {
  const [exam] = await db
    .select({
      id: exams.id,
      title: exams.title,
      formCount: exams.formCount,
      createdAt: exams.createdAt,
    })
    .from(exams)
    .where(and(eq(exams.orgId, orgId), eq(exams.id, examId)))
    .limit(1);
  if (exam === undefined) return null;

  const [keyRow] = await db
    .select()
    .from(answerKeys)
    .where(
      and(
        eq(answerKeys.orgId, orgId),
        eq(answerKeys.examId, examId),
        eq(answerKeys.formCode, form),
      ),
    )
    .limit(1);
  if (keyRow === undefined) return null;

  const key = keyOf(keyRow);
  if (key === null) return null;

  const papers = await db
    .select({
      id: scans.id,
      studentExtId: scans.studentExtId,
      answers: scans.answers,
      marks: scans.marks,
      deviceScore: scans.score,
      createdAt: scans.createdAt,
    })
    .from(scans)
    .where(and(eq(scans.orgId, orgId), eq(scans.examId, examId)))
    .orderBy(asc(scans.id));

  return { exam, key, roster: await rosterOf(db, orgId), scans: papers };
}
