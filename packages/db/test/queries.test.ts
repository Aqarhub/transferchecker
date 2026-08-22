// The reads the dashboard makes, over the seeded organisation.
//
// The interesting one is the last: the plan's stated reason for keeping answers
// as strings is that a teacher who finds a badly worded question re-grades the
// whole class without rescanning a single paper. That is a claim about the
// schema, so it is checked against the schema.

import { beforeAll, describe, expect, it } from 'vitest';
import { gradeStored, maxPointsOf, totalPointsOf } from '@transferchecker/grading';
import type { PGlite } from '@electric-sql/pglite';
import { DEMO_KEY, seedDemo } from '../src/seed';
import { examDataOf, examsOf, profileOf, rosterOf } from '../src/queries';
import { keyRow } from '../src/keys';
import { actAs, actAsOwner } from '../src/local';
import type { Database } from '../src/database';
import { ORG_A, ORG_B, USER_A, USER_B, freshDatabase, rows } from './harness';

const EXAM_A = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
const IDS = {
  orgId: ORG_A,
  userId: USER_A,
  examId: EXAM_A,
  templateId: 'dddddddd-1111-4111-8111-dddddddddddd',
};

let client: PGlite;
let db: Database;

beforeAll(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
  await seedDemo(db, IDS);
});

describe('the exam list', () => {
  it('returns the organisation own exams', async () => {
    const exams = await examsOf(db, ORG_A);
    expect(exams.map((exam) => exam.title)).toEqual(['اختبار الرياضيات القصير']);
  });

  it('returns nothing for an organisation with no exams', async () => {
    expect(await examsOf(db, ORG_B)).toEqual([]);
  });
});

describe('the profile', () => {
  it('returns the signed in person and nobody else', async () => {
    const mine = await profileOf(db, ORG_A, USER_A);
    expect(mine).toEqual({ email: 'teacher@example.sa', locale: 'ar', country: 'SA' });
    // The wrong organisation gets the same nothing an absent account gets.
    expect(await profileOf(db, ORG_B, USER_A)).toBeNull();
  });
});

describe('the roster', () => {
  it('keeps a leading zero, which is the whole reason the column is text', async () => {
    const roster = await rosterOf(db, ORG_A);
    expect(roster.map((student) => student.id)).toEqual([
      '00007',
      '00099',
      '00318',
      '00713',
      '01024',
      '02145',
    ]);
  });

  it('keeps a comma inside a name rather than splitting it', async () => {
    const roster = await rosterOf(db, ORG_A);
    expect(roster.map((student) => student.name)).toContain('الشمري, خالد');
  });
});

describe('one exam, with everything a screen needs', () => {
  it('reads the key back as the key that was written', async () => {
    const data = await examDataOf(db, ORG_A, EXAM_A);
    expect(data?.key).toEqual(DEMO_KEY);
  });

  it('carries the paper that has no student on it', async () => {
    const data = await examDataOf(db, ORG_A, EXAM_A);
    const unmatched = data?.scans.filter((scan) => scan.studentExtId === null) ?? [];
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.answers).toBe('3213?1132021');
  });

  it('carries both the left blank and the undecided symbols through unchanged', async () => {
    const data = await examDataOf(db, ORG_A, EXAM_A);
    const all = (data?.scans ?? []).map((scan) => scan.answers).join('');
    expect(all).toContain('?');
    expect(all).toContain('!');
  });

  it('is null for an exam in another organisation', async () => {
    expect(await examDataOf(db, ORG_B, EXAM_A)).toBeNull();
  });

  // Not a null check for its own sake: it is the same null a caller gets for an
  // exam that does not exist, so nothing about another organisation's contents
  // leaks through the difference between the two answers.
  it('is null for an exam nobody has, in the same way', async () => {
    expect(await examDataOf(db, ORG_A, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('the isolation holds through the query layer too', () => {
  it('hides the whole exam from a signed in client of another organisation', async () => {
    await client.exec(`insert into orgs (id, owner_id) values ('${ORG_B}', '${USER_B}')`);
    await actAs(client, { orgId: ORG_B, userId: USER_B });
    // Asking with the RIGHT organisation id while holding the WRONG token. The
    // filter in the query would have allowed this; the policy is what does not.
    expect(await examDataOf(db, ORG_A, EXAM_A)).toBeNull();
    await actAsOwner(client);
  });
});

describe('re-grading, which is what the string storage is for', () => {
  it('changes the class score from an edit to the key alone, with no paper rescanned', async () => {
    const before = await examDataOf(db, ORG_A, EXAM_A);
    if (before === null) throw new Error('seeded exam missing');
    const scoreOf = (data: NonNullable<typeof before>): number =>
      data.scans.reduce(
        (sum, scan) => sum + (gradeStored(data.key, scan.answers, scan.marks)?.score ?? 0),
        0,
      );
    const scansBefore = await rows<{ n: number }>(client, 'select count(*)::int as n from scans');

    // Question 1 was badly worded. Two of the six papers chose bubble 3, which
    // the teacher now accepts at half marks. Exactly the correction PLAN.md
    // section 5 describes, and the half stays under the intended answer's one
    // point so the paper's ceiling does not move.
    const fixed = {
      ...DEMO_KEY,
      questions: DEMO_KEY.questions.map((question, at) =>
        at === 0 ? { ...question, awards: [{ index: 3, points: 0.5 }] } : question,
      ),
    };
    const replacement = keyRow(fixed, {
      id: 'ffffffff-1111-4111-8111-ffffffffffff',
      orgId: ORG_A,
      examId: EXAM_A,
    });
    await client.exec(
      `update answer_keys set extras = '${JSON.stringify(replacement.extras)}'
       where exam_id = '${EXAM_A}'`,
    );

    const after = await examDataOf(db, ORG_A, EXAM_A);
    if (after === null) throw new Error('exam vanished');
    // Two papers, half a mark each, and the total each is out of is unchanged.
    expect(scoreOf(after)).toBe(scoreOf(before) + 1);
    expect(after.scans.length).toBe(before.scans.length);

    // Nothing was rescanned and nothing was rewritten. That is the point.
    const scansAfter = await rows<{ n: number }>(client, 'select count(*)::int as n from scans');
    expect(scansAfter[0]?.n).toBe(scansBefore[0]?.n);
  });

  // The plan says the maximum is shown and never stored. Nothing in the row
  // holds it, and it is still answerable from what the row does hold.
  it('derives the paper ceiling from the key rather than reading a column', async () => {
    const data = await examDataOf(db, ORG_A, EXAM_A);
    if (data === null) throw new Error('seeded exam missing');
    expect(totalPointsOf(data.key)).toBe(
      data.key.questions.reduce((sum, question) => sum + maxPointsOf(question), 0),
    );
    const columns = await rows<{ n: number }>(
      client,
      `select count(*)::int as n from information_schema.columns
       where table_schema = 'public' and column_name like '%max%'`,
    );
    expect(columns[0]?.n).toBe(0);
  });
});

describe('the version box, stored and read back in all three of its states', () => {
  it('returns what each seeded paper declared, with the blank box as null', async () => {
    const data = await examDataOf(db, ORG_A, EXAM_A);
    const declared = (data?.scans ?? []).map((scan) => scan.form);
    // Five papers said A. The sixth is the owner's own case: a standard50,
    // which prints the box on every copy, with the box left blank. It must come
    // back null, never the empty string the column holds and never undefined,
    // because undefined is the state that would excuse it from the fault.
    expect(declared.filter((form) => form === 'A')).toHaveLength(5);
    const unmatched = data?.scans.find((scan) => scan.studentExtId === null);
    expect(unmatched?.form).toBeNull();
  });

  it('keeps a sheet that prints no box distinct from a box left blank', async () => {
    // Written raw, as the sync layer one day will: SQL NULL is the no-box
    // state. If the query layer folded it into the blank-box state, this exact
    // read would refuse every quick20 in the product once grading sees it.
    await client.exec(
      `insert into scans (id, org_id, exam_id, student_ext_id, form, answers, marks,
                          score, total, device_id, client_ts)
       values ('99999999-9999-4999-8999-999999999999', '${ORG_A}', '${EXAM_A}', '00007',
               null, '021301132021', 'cccccccccccc', 0, 0, 'demo-device', now())`,
    );
    const data = await examDataOf(db, ORG_A, EXAM_A);
    const added = data?.scans.find((scan) => scan.id === '99999999-9999-4999-8999-999999999999');
    if (added === undefined) throw new Error('the inserted scan did not come back');
    expect(added.form).toBeUndefined();
  });

  // The whole round exists for this case, so it is pinned through the real
  // storage, not only through the pure function: a paper that named form B is
  // returned by examDataOf unfiltered, and grading it against the A key that
  // the caller viewed raises the mismatch fault instead of a silent grade.
  it('carries a foreign form through storage and out as a mismatch fault', async () => {
    await client.exec(
      `insert into scans (id, org_id, exam_id, student_ext_id, form, answers, marks,
                          score, total, device_id, client_ts)
       values ('77777777-7777-4777-8777-777777777777', '${ORG_A}', '${EXAM_A}', '00099',
               'B', '021301132021', 'cccccccccccc', 0, 0, 'demo-device', now())`,
    );
    const data = await examDataOf(db, ORG_A, EXAM_A);
    const foreign = data?.scans.find((scan) => scan.id === '77777777-7777-4777-8777-777777777777');
    if (foreign === undefined || data === null) throw new Error('the B paper did not come back');
    expect(foreign.form).toBe('B');
    const grade = gradeStored(data.key, foreign.answers, foreign.marks, foreign.form);
    expect(grade?.formFault).toBe('mismatch');
    expect(grade?.needsReview).toBe(true);
  });

  it('refuses a form longer than any key can be, which is a device writing garbage', async () => {
    // The bound is pinned from BOTH sides. Four characters is the grading
    // schema's own ceiling and must be accepted, or tightening the constraint
    // to something narrower would pass every other test in this suite.
    await client.exec(
      `insert into scans (id, org_id, exam_id, student_ext_id, form, answers, marks,
                          score, total, device_id, client_ts)
       values ('66666666-6666-4666-8666-666666666666', '${ORG_A}', '${EXAM_A}', '00007',
               'ABCD', '021301132021', 'cccccccccccc', 0, 0, 'demo-device', now())`,
    );
    await expect(
      client.exec(
        `insert into scans (id, org_id, exam_id, student_ext_id, form, answers, marks,
                            score, total, device_id, client_ts)
         values ('88888888-8888-4888-8888-888888888888', '${ORG_A}', '${EXAM_A}', '00007',
                 'ABCDE', '021301132021', 'cccccccccccc', 0, 0, 'demo-device', now())`,
      ),
    ).rejects.toThrow(/scans_form_length/);
  });
});
