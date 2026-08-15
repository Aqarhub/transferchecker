// Turning one read paper into one score, and saying what it could not decide.
//
// The rule this file exists to hold: a question the machine would not decide is
// worth zero AND is reported. Scoring it as a wrong answer would be a silent
// grade, which is the one failure every defense in `core-omr` was built to
// prevent, and it would arrive here at the last step after all of them.
//
// Re-grading is the same function. A teacher who accepts a second answer on
// question six after marking the class calls this again over the stored answer
// strings, and no paper is rescanned. That is why `PLAN.md` keeps alternates in
// the key rather than in the sheet: the printed paper never changes.

import { decodeAnswers } from './answers';
import type { Answer } from './answers';
import { maxPointsOf, pointsFor, totalPointsOf } from './key';
import type { AnswerKey, QuestionKey } from './key';
import { marksReview } from './read';

export interface QuestionGrade {
  /** One based, as printed on the sheet. */
  readonly question: number;
  readonly awarded: number;
  readonly max: number;
  /**
   * Whether the student got the intended answer, and null when the question
   * cannot say: unkeyed, unresolved, or left blank.
   *
   * Null rather than false, because item analysis divides by the number of
   * students who ANSWERED, and folding blanks into wrong answers is how a
   * question everybody skipped reads as a question everybody failed.
   */
  readonly correct: boolean | null;
  /** True when this question needs a person to look at it before the grade stands. */
  readonly review: boolean;
}

export interface Grade {
  readonly score: number;
  readonly total: number;
  readonly questions: readonly QuestionGrade[];
  /** Questions the machine would not decide. Never zero silently. */
  readonly unresolved: number;
  readonly blanks: number;
  /** Questions that cost the teacher a look, which is the wider set. */
  readonly reviews: number;
  /** True while anything on this paper is waiting for a person. */
  readonly needsReview: boolean;
}

const sameSet = (left: readonly number[], right: readonly number[]): boolean =>
  left.length === right.length && left.every((value, at) => value === right[at]);

/** What one answer earns against one question's table. */
function awardOf(
  question: QuestionKey,
  answer: Answer,
): { awarded: number; correct: boolean | null } {
  if (question.intended === null) return { awarded: 0, correct: null };

  switch (answer.kind) {
    case 'blank':
    case 'unresolved':
      return { awarded: 0, correct: null };
    case 'one': {
      const awarded = pointsFor(question, answer.index);
      const correct = typeof question.intended === 'number' && question.intended === answer.index;
      return { awarded, correct };
    }
    case 'many': {
      // Bubble by bubble, because "choose all that apply" is a series of
      // decisions and a teacher who penalises a wrong tick still expects the
      // right ones to count. A single answer key read by a `many` paper falls
      // through to the same table and simply finds one entry.
      const awarded = answer.indexes.reduce((sum, index) => sum + pointsFor(question, index), 0);
      const intended = Array.isArray(question.intended) ? question.intended : [question.intended];
      const sorted = [...answer.indexes].sort((a, b) => a - b);
      return {
        awarded,
        correct: sameSet(
          sorted,
          [...intended].sort((a, b) => a - b),
        ),
      };
    }
  }
}

/**
 * One paper, scored.
 *
 * `marks` is defense د20's one character per question, and it is passed rather
 * than recomputed because it is what the record STORED. A question that carried
 * an eraser ghost or a mark that left its bubble is worth its points and still
 * costs the teacher a look, and only that string remembers which.
 */
export function gradeAnswers(key: AnswerKey, answers: readonly Answer[], marks = ''): Grade {
  const questions: QuestionGrade[] = [];
  let score = 0;
  let unresolved = 0;
  let blanks = 0;
  let reviews = 0;

  for (const [at, question] of key.questions.entries()) {
    const answer = answers[at] ?? { kind: 'blank' as const };
    if (answer.kind === 'unresolved') unresolved += 1;
    if (answer.kind === 'blank') blanks += 1;

    const { awarded, correct } = awardOf(question, answer);
    const max = maxPointsOf(question);
    const mark = marks[at];
    const review = answer.kind === 'unresolved' || (mark !== undefined && marksReview(mark));
    if (review) reviews += 1;
    score += awarded;
    questions.push({ question: at + 1, awarded, max, correct, review });
  }

  return {
    score,
    total: totalPointsOf(key),
    questions,
    unresolved,
    blanks,
    reviews,
    needsReview: reviews > 0,
  };
}

/**
 * The same thing from what the database holds, which is the re-grading path.
 *
 * Null for a stored string that does not decode to this key's question count,
 * because a score computed against the wrong sheet looks exactly like a real
 * one, and this is the only place that can still tell.
 */
export function gradeStored(key: AnswerKey, stored: string, marks = ''): Grade | null {
  const answers = decodeAnswers(stored, key.questions.length);
  return answers === null ? null : gradeAnswers(key, answers, marks);
}
