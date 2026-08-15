// Item analysis, and the four places a confident wrong number could leave.

import { describe, expect, it } from 'vitest';
import { decodeAnswers } from '../src/answers';
import { gradeAnswers } from '../src/grade';
import { MIN_PAPERS_FOR_INDICES, analyseItems } from '../src/item';
import type { AnalysedPaper } from '../src/item';
import type { AnswerKey, QuestionKey } from '../src/key';

const q = (patch: Partial<QuestionKey> = {}): QuestionKey => ({
  intended: 0,
  points: 1,
  awards: [],
  tags: [],
  ...patch,
});

const keyOf = (questions: QuestionKey[]): AnswerKey => ({ form: 'A', questions });

/** A class, written as the stored strings it would really be held as. */
function classOf(key: AnswerKey, stored: readonly string[]): AnalysedPaper[] {
  return stored.map((paper) => {
    const answers = decodeAnswers(paper, key.questions.length);
    if (answers === null) throw new Error(`this test's own paper is malformed: ${paper}`);
    return { answers, grade: gradeAnswers(key, answers) };
  });
}

/** `count` papers where the first `right` of them answer question one correctly. */
function graded(key: AnswerKey, count: number, right: number): AnalysedPaper[] {
  return classOf(
    key,
    Array.from({ length: count }, (_, at) => (at < right ? '000' : '100')),
  );
}

describe('difficulty and what is allowed into it', () => {
  it('measures over the students who attempted, not over the class', () => {
    const key = keyOf([q(), q(), q()]);
    const papers = classOf(key, ['000', '100', '?00', '000']);
    const item = analyseItems(key, papers).items[0];
    // Three attempted, two right. The blank is neither right nor wrong.
    expect(item).toMatchObject({ attempted: 3, correct: 2, omitted: 1, unresolved: 0 });
    expect(item?.difficulty).toBeCloseTo(2 / 3);
  });

  it('drops a question the machine would not read, and says how many', () => {
    // OUR failure, not the student's. Letting it in would turn our uncertainty
    // into their mistake and then into a judgement about the question.
    const key = keyOf([q(), q(), q()]);
    const papers = classOf(key, ['000', '!00', '!00', '100']);
    const item = analyseItems(key, papers).items[0];
    expect(item).toMatchObject({ papers: 4, unresolved: 2, attempted: 2, correct: 1 });
    expect(item?.difficulty).toBeCloseTo(0.5);
  });

  it('reports no difficulty at all when nobody attempted it', () => {
    const key = keyOf([q(), q(), q()]);
    const item = analyseItems(key, classOf(key, ['?00', '?00'])).items[0];
    expect(item?.difficulty).toBeNull();
  });
});

describe('discrimination, which is noise on one classroom', () => {
  it('refuses to report an index below the floor', () => {
    // The standard error of a correlation at n = 30 is about 0.19, so an item
    // at 0.30 and an item at 0.00 are not distinguishable in one class. Below
    // the floor the answer is null, not a number a teacher would act on.
    const key = keyOf([q(), q(), q()]);
    const small = analyseItems(key, graded(key, 10, 6));
    expect(small.indicesArmed).toBe(false);
    expect(small.items[0]?.discrimination).toBeNull();
    expect(small.items[0]?.upperLower).toBeNull();
    // And difficulty, which is a count and not an index, is still reported.
    expect(small.items[0]?.difficulty).toBeCloseTo(0.6);
  });

  it('reports one once the class is big enough', () => {
    const key = keyOf([q(), q({ intended: 0 }), q({ intended: 0 })]);
    // Papers where the strong half gets question one right and the weak half
    // gets nothing right at all.
    const papers = classOf(
      key,
      Array.from({ length: MIN_PAPERS_FOR_INDICES }, (_, at) => (at % 2 === 0 ? '000' : '111')),
    );
    const analysis = analyseItems(key, papers);
    expect(analysis.indicesArmed).toBe(true);
    expect(analysis.items[0]?.discrimination).toBeGreaterThan(0.9);
  });

  it('correlates a question against the REST of the paper and never against itself', () => {
    // An uncorrected coefficient correlates a question with a total that
    // contains it, which flatters every item on a short test, and a short test
    // is what this product marks.
    const key = keyOf([q(), q(), q()]);
    // Everybody gets questions two and three right, so the only variation in a
    // whole-paper total would come from question one itself. Corrected, there
    // is nothing left to correlate against, and the honest answer is null.
    const papers = classOf(
      key,
      Array.from({ length: MIN_PAPERS_FOR_INDICES }, (_, at) => (at % 2 === 0 ? '000' : '100')),
    );
    expect(analyseItems(key, papers).items[0]?.discrimination).toBeNull();
  });
});

describe('the distractors, which is the part a teacher acts on', () => {
  it('counts who chose what, blanks included', () => {
    const key = keyOf([q(), q(), q()]);
    const papers = classOf(key, ['000', '100', '100', '200', '?00']);
    const options = analyseItems(key, papers).items[0]?.options ?? [];
    // Everyone answered questions two and three the same way here, so every
    // mean of the rest is the same 2, and what this asserts is the tally.
    expect(options).toEqual([
      { index: 0, chosen: 1, meanRest: 2 },
      { index: 1, chosen: 2, meanRest: 2 },
      { index: 2, chosen: 1, meanRest: 2 },
      { index: null, chosen: 1, meanRest: 2 },
    ]);
  });

  it('names a question whose key looks wrong', () => {
    // The likeliest cause of a distractor that the stronger students prefer is
    // a miskeyed question, which marks a whole class wrong and which a teacher
    // can fix in one edit once they are told.
    const key = keyOf([q({ intended: 0 }), q({ intended: 1 }), q({ intended: 1 })]);
    const papers = classOf(key, [
      // The strong students all picked bubble 2 on question one.
      '211',
      '211',
      '211',
      // The weak ones picked the keyed bubble and got nothing else right.
      '000',
      '000',
    ]);
    expect(analyseItems(key, papers).items[0]?.suspectKey).toBe(true);
    // And a healthy question is not accused.
    expect(analyseItems(key, papers).items[1]?.suspectKey).toBe(false);
  });

  it('does not accuse a key on one strong student having a bad moment', () => {
    const key = keyOf([q({ intended: 0 }), q({ intended: 1 }), q({ intended: 1 })]);
    const papers = classOf(key, ['211', '011', '011', '000']);
    expect(analyseItems(key, papers).items[0]?.suspectKey).toBe(false);
  });
});

describe('reliability', () => {
  it('is null where it would be a division by nothing', () => {
    const key = keyOf([q(), q(), q()]);
    // One paper, and then a class where everybody scored identically.
    expect(analyseItems(key, classOf(key, ['000'])).reliability).toBeNull();
    expect(analyseItems(key, classOf(key, ['000', '000', '000'])).reliability).toBeNull();
    expect(analyseItems(keyOf([q()]), classOf(keyOf([q()]), ['0', '1'])).reliability).toBeNull();
  });

  it('rises with a test whose items agree with each other', () => {
    const key = keyOf([q(), q(), q(), q()]);
    // Half the class gets everything right and half gets nothing: perfectly
    // consistent items, which is the top of this scale.
    const consistent = classOf(
      key,
      Array.from({ length: 20 }, (_, at) => (at % 2 === 0 ? '0000' : '1111')),
    );
    const alpha = analyseItems(key, consistent).reliability ?? 0;
    expect(alpha).toBeGreaterThan(0.95);
  });

  it('leaves out a paper with a hole in it rather than scoring the hole zero', () => {
    // Scoring an unresolved question zero says the student failed a question we
    // could not read; dropping the question drops it for the whole class.
    const key = keyOf([q(), q(), q(), q()]);
    const clean = Array.from({ length: 20 }, (_, at) => (at % 2 === 0 ? '0000' : '1111'));
    const withHole = analyseItems(key, classOf(key, [...clean, '!!!!'])).reliability;
    expect(withHole).toBeCloseTo(analyseItems(key, classOf(key, clean)).reliability ?? 0, 10);
  });
});
