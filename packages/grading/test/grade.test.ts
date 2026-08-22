// The arithmetic, and the two rules that are not arithmetic.
//
// A question the machine would not decide is worth zero AND is reported, and a
// question nobody keyed is out of zero rather than out of one. Both are places
// where a plausible looking number would otherwise leave the building.

import { describe, expect, it } from 'vitest';
import { gradeAnswers, gradeStored } from '../src/grade';
import { maxPointsOf, totalPointsOf, unkeyed } from '../src/key';
import type { AnswerKey, QuestionKey } from '../src/key';

const q = (patch: Partial<QuestionKey> = {}): QuestionKey => ({
  intended: 0,
  points: 1,
  awards: [],
  tags: [],
  ...patch,
});

const keyOf = (questions: QuestionKey[]): AnswerKey => ({ form: 'A', questions });

describe('scoring one paper', () => {
  it('scores the ordinary case, which is most of every class', () => {
    const key = keyOf([q({ intended: 0 }), q({ intended: 2 }), q({ intended: 1 })]);
    const grade = gradeStored(key, '020');
    expect(grade?.score).toBe(2);
    expect(grade?.total).toBe(3);
    expect(grade?.questions.map((entry) => entry.correct)).toEqual([true, true, false]);
  });

  it('carries fractional weights, because a competitor marks out of 9.5', () => {
    const key = keyOf([q({ points: 0.5 }), q({ intended: 1, points: 2.5 })]);
    expect(totalPointsOf(key)).toBe(3);
    expect(gradeStored(key, '01')?.score).toBe(3);
  });

  it('grants an alternate answer its OWN points, not those of the intended one', () => {
    // PLAN.md section 5: the model is a map from bubble to points, and the
    // intended answer is only the entry the teacher marked.
    const key = keyOf([q({ intended: 0, points: 1, awards: [{ index: 3, points: 0.5 }] })]);
    expect(gradeStored(key, '3')?.score).toBe(0.5);
    expect(gradeStored(key, '3')?.questions[0]?.correct).toBe(false);
    expect(maxPointsOf(key.questions[0] ?? unkeyed())).toBe(1);
  });

  it('takes marks away where the teacher penalises a guess', () => {
    const key = keyOf([q({ intended: 0, points: 1, awards: [{ index: 1, points: -0.25 }] })]);
    expect(gradeStored(key, '1')?.score).toBe(-0.25);
    // And a penalty never raises the ceiling.
    expect(gradeStored(key, '1')?.total).toBe(1);
  });

  it('derives the ceiling instead of storing it', () => {
    // An alternate worth MORE than the intended answer raises the question's
    // maximum, and a stored ceiling would have gone on disagreeing with it.
    const question = q({ intended: 0, points: 1, awards: [{ index: 2, points: 2 }] });
    expect(maxPointsOf(question)).toBe(2);
  });
});

describe('the two rules that are not arithmetic', () => {
  it('reports a question the machine would not decide, and scores it zero', () => {
    const key = keyOf([q(), q(), q()]);
    const grade = gradeStored(key, '0!0');
    expect(grade?.score).toBe(2);
    expect(grade?.unresolved).toBe(1);
    expect(grade?.needsReview).toBe(true);
    expect(grade?.questions[1]).toMatchObject({ awarded: 0, correct: null, review: true });
  });

  it('scores an unkeyed question out of zero, not out of one', () => {
    // A key built by scanning a solved sheet has whatever the teacher shaded,
    // and a question they skipped has no answer yet. Counting it out of one
    // would deflate every paper in the class by a mark nobody set.
    const key = keyOf([q(), unkeyed(), q()]);
    expect(totalPointsOf(key)).toBe(2);
    const grade = gradeStored(key, '000');
    expect(grade?.score).toBe(2);
    expect(grade?.questions[1]).toMatchObject({ awarded: 0, max: 0, correct: null });
  });

  it('keeps a blank apart from a wrong answer in the item record', () => {
    // Item analysis divides by the students who answered. Folding blanks into
    // wrong answers turns a question everybody skipped into one everybody
    // failed, which is the opposite instruction to a teacher.
    const key = keyOf([q()]);
    expect(gradeStored(key, '?')?.questions[0]?.correct).toBeNull();
    expect(gradeStored(key, '1')?.questions[0]?.correct).toBe(false);
  });

  it('flags a question whose mark string warns, even when the letter is right', () => {
    // An eraser ghost and a mark that left its bubble both ride on a correct
    // answer. Counting them as clean is exactly the blind spot the golden set
    // found in its own report: full marks, and a teacher never told.
    const key = keyOf([q(), q(), q()]);
    const grade = gradeAnswers(
      key,
      [
        { kind: 'one', index: 0 },
        { kind: 'one', index: 0 },
        { kind: 'one', index: 0 },
      ],
      'cex',
    );
    expect(grade.score).toBe(3);
    expect(grade.reviews).toBe(2);
    expect(grade.questions.map((entry) => entry.review)).toEqual([false, true, true]);
  });
});

describe('select many, scored bubble by bubble', () => {
  it('adds up the bubbles the student ticked', () => {
    const key = keyOf([
      q({
        intended: [0, 2],
        points: 1,
        awards: [{ index: 3, points: -1 }],
      }),
    ]);
    expect(gradeStored(key, '[02]')?.score).toBe(2);
    expect(gradeStored(key, '[02]')?.questions[0]?.correct).toBe(true);
    // One right, one wrong: the right one still counts, the wrong one costs.
    expect(gradeStored(key, '[03]')?.score).toBe(0);
    expect(gradeStored(key, '[03]')?.questions[0]?.correct).toBe(false);
    // The ceiling is every positive entry, since each is a separate decision.
    expect(gradeStored(key, '[02]')?.total).toBe(2);
  });

  it('does not call a partial answer correct', () => {
    const key = keyOf([q({ intended: [0, 2] })]);
    expect(gradeStored(key, '[0]')?.questions[0]?.correct).toBe(false);
    expect(gradeStored(key, '[0]')?.score).toBe(1);
  });
});

describe('re-grading, which is why alternates live in the key', () => {
  it('rescores a whole class from stored strings with no paper rescanned', () => {
    // A teacher finds question two badly worded AFTER marking the class. The
    // printed paper never changes and no photograph is needed, which is the
    // practical reason PLAN.md keeps alternates out of the sheet.
    const before = keyOf([q({ intended: 0 }), q({ intended: 1 }), q({ intended: 2 })]);
    const papers = ['012', '032', '002'];
    expect(papers.map((paper) => gradeStored(before, paper)?.score)).toEqual([3, 2, 2]);

    const after = keyOf([
      q({ intended: 0 }),
      q({
        intended: 1,
        awards: [
          { index: 3, points: 1 },
          { index: 0, points: 1 },
        ],
      }),
      q({ intended: 2 }),
    ]);
    expect(papers.map((paper) => gradeStored(after, paper)?.score)).toEqual([3, 3, 3]);
  });

  it('refuses to score a record that belongs to another sheet', () => {
    const key = keyOf([q(), q(), q()]);
    expect(gradeStored(key, '00')).toBeNull();
    expect(gradeStored(key, '0000')).toBeNull();
  });
});

describe('the printed form, which is the one fault that costs every question', () => {
  const key = keyOf([q({ intended: 0 }), q({ intended: 1 }), q({ intended: 2 })]);
  const clean = [
    { kind: 'one' as const, index: 0 },
    { kind: 'one' as const, index: 1 },
    { kind: 'one' as const, index: 2 },
  ];

  it('says nothing about a sheet that prints no version box', () => {
    // quick20 and full100 set keyVersions false, so most papers in the product
    // never declare a form and demanding one would refuse all of them.
    const grade = gradeAnswers(key, clean, 'ccc');
    expect(grade.formFault).toBe('none');
    expect(grade.needsReview).toBe(false);
    expect(grade.score).toBe(3);
  });

  it('accepts a paper that named the key it is being graded against', () => {
    const grade = gradeAnswers(key, clean, 'ccc', 'A');
    expect(grade.formFault).toBe('none');
    expect(grade.needsReview).toBe(false);
  });

  // The owner's own standard50: the box is printed on every copy of that
  // template and his paper left it empty. Before this, the grade came back 3 of
  // 3 with needsReview false and nothing anywhere recording that the paper had
  // not said which form it was.
  it('refuses to let an unanswered version box pass as a clean grade', () => {
    const grade = gradeAnswers(key, clean, 'ccc', null);
    expect(grade.formFault).toBe('unreadable');
    expect(grade.needsReview).toBe(true);
  });

  it('catches a paper graded against another form entirely', () => {
    const grade = gradeAnswers(key, clean, 'ccc', 'B');
    expect(grade.formFault).toBe('mismatch');
    expect(grade.needsReview).toBe(true);
  });

  it('flags the paper even when every single question was clean', () => {
    // The point worth stating: this fault is not visible in the question
    // counters. Every one of them is zero here.
    const grade = gradeAnswers(key, clean, 'ccc', null);
    expect([grade.unresolved, grade.blanks, grade.reviews]).toEqual([0, 0, 0]);
    expect(grade.needsReview).toBe(true);
  });

  // Re-grading runs over what the database stored, months after the scan. If
  // the stored path dropped the form, the device would raise the fault and the
  // dashboard's re-grade would clear it, on the same paper.
  it('carries the form through the stored path, which is what re-grading uses', () => {
    expect(gradeStored(key, '012', 'ccc', 'A')?.formFault).toBe('none');
    expect(gradeStored(key, '012', 'ccc', null)?.formFault).toBe('unreadable');
    expect(gradeStored(key, '012', 'ccc', 'B')?.formFault).toBe('mismatch');
    // And absent stays absent: a sheet with no version box re-grades clean.
    expect(gradeStored(key, '012', 'ccc')?.formFault).toBe('none');
  });
});
