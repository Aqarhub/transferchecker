// Tag reports, and the one rule in them that is not arithmetic.

import { describe, expect, it } from 'vitest';
import { decodeAnswers } from '../src/answers';
import { gradeAnswers } from '../src/grade';
import { tagReport, tagScores, tagsOf } from '../src/tags';
import type { TaggedPaper } from '../src/tags';
import type { AnswerKey, QuestionKey } from '../src/key';

const q = (tags: string[], patch: Partial<QuestionKey> = {}): QuestionKey => ({
  intended: 0,
  points: 1,
  awards: [],
  tags,
  ...patch,
});

const KEY: AnswerKey = {
  form: 'A',
  questions: [
    q(['كسور']),
    q(['كسور', 'معيار-3.2']),
    q(['هندسة']),
    q([]),
    q(['كسور'], { points: 2 }),
  ],
};

function paperOf(key: AnswerKey, stored: string): TaggedPaper {
  const answers = decodeAnswers(stored, key.questions.length);
  if (answers === null) throw new Error(`this test's own paper is malformed: ${stored}`);
  return { answers, grade: gradeAnswers(key, answers) };
}

describe('one paper by tag', () => {
  it('lists the tags in the order the teacher first used them', () => {
    expect(tagsOf(KEY)).toEqual(['كسور', 'معيار-3.2', 'هندسة']);
  });

  it('scores a tag over its own questions and their own weights', () => {
    // Fractions is questions 1, 2 and 5, and question 5 is worth two.
    const scores = tagScores(KEY, paperOf(KEY, '01100'));
    expect(scores[0]).toMatchObject({ tag: 'كسور', questions: [1, 2, 5], points: 3, max: 4 });
    expect(scores[0]?.share).toBeCloseTo(0.75);
    expect(scores[2]).toMatchObject({ tag: 'هندسة', points: 0, max: 1 });
  });

  it('leaves an untagged question out of every tag', () => {
    const scores = tagScores(KEY, paperOf(KEY, '11110'));
    const counted = scores.flatMap((score) => score.questions);
    expect(counted).not.toContain(4);
  });
});

describe('a question the machine would not read leaves the denominator too', () => {
  it('does not score a student zero on a topic we could not read', () => {
    // A student whose fractions question was unreadable did not score zero on
    // fractions, and telling a teacher they did sends them to reteach a topic
    // on our failure.
    const scores = tagScores(KEY, paperOf(KEY, '0!100'));
    const fractions = scores[0];
    // Questions 1 and 5 counted, question 2 dropped from both sides.
    expect(fractions).toMatchObject({ points: 3, max: 3, unresolved: 1 });
    expect(fractions?.share).toBe(1);
  });

  it('reports no share at all when nothing under a tag could be counted', () => {
    const scores = tagScores(KEY, paperOf(KEY, '!!1!!'));
    expect(scores[0]).toMatchObject({ points: 0, max: 0, unresolved: 3 });
    expect(scores[0]?.share).toBeNull();
  });
});

describe('the class by tag', () => {
  it('sums over papers rather than averaging their shares', () => {
    // They differ whenever papers have different numbers of countable
    // questions, which is exactly what an unresolved question causes, and a
    // mean of shares would let a paper with one readable fractions question
    // weigh as much as a paper with three.
    const report = tagReport(KEY, [
      paperOf(KEY, '01100'), // 3 of 4 on fractions
      paperOf(KEY, '0!100'), // 3 of 3, because question 2 was unreadable
    ]);
    const fractions = report.overall[0];
    expect(fractions).toMatchObject({ points: 6, max: 7, unresolved: 1 });
    expect(fractions?.share).toBeCloseTo(6 / 7);
    // The mean of the shares would have been 0.875, which is the wrong answer.
    expect(fractions?.share).not.toBeCloseTo(0.875);
  });

  it('keeps the per paper breakdown for the conversation with one student', () => {
    const report = tagReport(KEY, [paperOf(KEY, '00100'), paperOf(KEY, '11111')]);
    expect(report.papers).toBe(2);
    expect(report.perPaper[1]?.[0]?.points).toBe(0);
  });

  it('answers on an empty class without inventing a number', () => {
    const report = tagReport(KEY, []);
    expect(report.papers).toBe(0);
    expect(report.overall.map((score) => score.share)).toEqual([null, null, null]);
  });

  it('is computed from the stored strings, so a tag added later needs no rescan', () => {
    // The same practical property alternate answers have, and for the same
    // reason: the printed paper never changes.
    const papers = ['01100', '01100'].map((stored) => paperOf(KEY, stored));
    const before = tagReport(KEY, papers).overall.length;
    const retagged: AnswerKey = {
      ...KEY,
      questions: KEY.questions.map((question, at) =>
        at === 3 ? { ...question, tags: ['قياس'] } : question,
      ),
    };
    const after = tagReport(
      retagged,
      papers.map((paper) => paper),
    );
    expect(after.overall.length).toBe(before + 1);
    expect(after.overall.at(-1)).toMatchObject({ tag: 'قياس', questions: [4] });
  });
});
