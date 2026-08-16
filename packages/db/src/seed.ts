// One organisation's worth of rows, written through the real schema.
//
// WHAT THIS IS AND WHAT IT IS NOT. It is not sample data for a screenshot. It is
// the class that used to live as literals inside `apps/web/src/data.ts`, moved
// into the database it was always describing, so the dashboard reads rows
// through the same queries a server will run instead of reading constants that
// happen to be shaped like rows. The numbers on the screens are still this
// class, because there is no server and no teacher yet. What changed is that
// they now travel the whole path: insert, policy, index, query, decode, grade.
//
// The awkward cases are here on purpose and are the reason this is worth
// seeding at all: an identifier with leading zeros, a name with a comma in it, a
// paper the machine would not decide, a question left blank, a question nobody
// keyed, and a pupil with no paper.

import { gradeStored } from '@transferchecker/grading';
import type { AnswerKey } from '@transferchecker/grading';
import { keyRow } from './keys';
import { answerKeys } from './schema/answer-keys';
import { exams } from './schema/exams';
import { orgs } from './schema/orgs';
import { scans } from './schema/scans';
import { students } from './schema/students';
import { templates } from './schema/templates';
import { users } from './schema/users';
import { uuid7Source } from './uuidv7';
import type { Database } from './database';

/** Twelve questions, weighted, tagged, and one of them deliberately unkeyed. */
export const DEMO_KEY: AnswerKey = {
  form: 'A',
  questions: [
    { intended: 0, points: 1, awards: [], tags: ['كسور'] },
    { intended: 2, points: 1, awards: [], tags: ['كسور'] },
    { intended: 1, points: 1, awards: [{ index: 3, points: 0.5 }], tags: ['كسور', 'معيار-3.2'] },
    { intended: 3, points: 2, awards: [], tags: ['هندسة'] },
    { intended: 0, points: 1, awards: [], tags: ['هندسة'] },
    { intended: 2, points: 1, awards: [], tags: ['قياس'] },
    { intended: 1, points: 1, awards: [], tags: ['قياس'] },
    { intended: 3, points: 1, awards: [], tags: ['كسور'] },
    { intended: 0, points: 1.5, awards: [], tags: ['هندسة'] },
    { intended: 2, points: 1, awards: [], tags: ['قياس'] },
    { intended: null, points: 1, awards: [], tags: [] },
    { intended: 1, points: 1, awards: [], tags: ['كسور'] },
  ],
};

/** The roster, with the identifiers written as the school writes them. */
const ROSTER: readonly { extId: string; name: string }[] = [
  { extId: '00007', name: 'سارة القحطاني' },
  { extId: '00099', name: 'ريم الغامدي' },
  { extId: '00318', name: 'نورة بنت محمد العتيبي' },
  { extId: '00713', name: 'عَبْدُالله الزهراني' },
  { extId: '01024', name: 'الشمري, خالد' },
  { extId: '02145', name: 'فيصل الدوسري' },
];

/**
 * The papers, as the strings the database holds.
 *
 * `?` is a question the student left and `!` is one the machine would not
 * decide. Both are here because they are the two states a dashboard built on
 * happy paths gets wrong, and the design system has a rule about each.
 */
const PAPERS: readonly { extId: string | null; answers: string; marks: string; day: number }[] = [
  { extId: '00007', answers: '021301132021', marks: 'cccccccccccb', day: 14 },
  { extId: '00099', answers: '02130113202?', marks: 'ccccccccccbb', day: 14 },
  { extId: '00318', answers: '0213011!2021', marks: 'ccccccdccccb', day: 14 },
  { extId: '00713', answers: '331301132021', marks: 'eccccccccccb', day: 15 },
  { extId: '01024', answers: '021311132001', marks: 'ccccuccccccb', day: 15 },
  // No identifier: the grid was unreadable, so the paper is stored unmatched
  // rather than guessed onto a pupil.
  { extId: null, answers: '3213?1132021', marks: 'ccccbccccccb', day: 15 },
];

export interface DemoIds {
  readonly orgId: string;
  readonly userId: string;
  readonly examId: string;
  readonly templateId: string;
}

/**
 * Fills a prepared database with the demo organisation and returns its ids.
 *
 * Ids are generated with the same UUIDv7 source the device uses, from a fixed
 * clock, so two seeded builds produce byte identical pages and a language
 * comparison stays a diff rather than a judgement.
 */
export async function seedDemo(db: Database, ids: DemoIds): Promise<void> {
  let tick = Date.UTC(2026, 7, 14, 6, 0, 0);
  const clock = (): number => {
    tick += 1;
    return tick;
  };
  const nextId = uuid7Source(clock, () => new Uint8Array(8).fill(0x5a));

  await db.insert(orgs).values({ id: ids.orgId, ownerId: ids.userId });
  await db.insert(users).values({
    id: ids.userId,
    orgId: ids.orgId,
    email: 'teacher@example.sa',
    locale: 'ar',
    country: 'SA',
  });
  await db.insert(templates).values({
    id: ids.templateId,
    orgId: ids.orgId,
    spec: { template: 'standard50' },
  });
  await db.insert(exams).values({
    id: ids.examId,
    orgId: ids.orgId,
    title: 'اختبار الرياضيات القصير',
    templateId: ids.templateId,
    formCount: 1,
  });
  await db
    .insert(answerKeys)
    .values(keyRow(DEMO_KEY, { id: nextId(), orgId: ids.orgId, examId: ids.examId }));
  await db.insert(students).values(
    ROSTER.map((student) => ({
      id: nextId(),
      orgId: ids.orgId,
      extId: student.extId,
      name: student.name,
    })),
  );
  await db.insert(scans).values(
    PAPERS.map((paper) => {
      const at = new Date(Date.UTC(2026, 7, paper.day, 9, 0, 0));
      // What the device scored it at, computed the way the device would: from
      // the strings and the key it held at the time. Stored rather than left at
      // zero so the difference between a stored score and a recomputed one is a
      // real difference when the key is later edited, which is the whole reason
      // re-grading without rescanning works.
      const grade = gradeStored(DEMO_KEY, paper.answers, paper.marks);
      return {
        id: nextId(),
        orgId: ids.orgId,
        examId: ids.examId,
        studentExtId: paper.extId,
        answers: paper.answers,
        marks: paper.marks,
        score: grade?.score ?? 0,
        total: grade?.total ?? 0,
        deviceId: 'demo-device',
        clientTs: at,
        createdAt: at,
      };
    }),
  );
}
