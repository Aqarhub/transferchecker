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
  /**
   * Whether the paper agreed with the key about WHICH PRINTED FORM it is.
   *
   * THIS IS THE ONE FAULT ON THE PAPER THAT COSTS EVERY QUESTION AT ONCE. A
   * wrong answer loses a mark. A form read against the wrong key rewrites the
   * whole sheet, and it does it quietly, because a full set of plausible answers
   * scored against the wrong table still looks like a graded paper.
   *
   * `unreadable` is the case the first real sheet showed: `standard50` prints a
   * version box on every copy, the owner's paper left it empty, and the grade
   * came out 50 of 50 or 0 of 50 with nothing anywhere saying the paper had not
   * said which form it was.
   *
   * The engine cannot decide this itself, because it does not know whether the
   * exam has one form or four. It reports what the paper said and this layer,
   * which holds the key, decides what that means.
   */
  readonly formFault: 'none' | 'unreadable' | 'mismatch';
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
export function gradeAnswers(
  key: AnswerKey,
  answers: readonly Answer[],
  marks = '',
  /**
   * The form the paper declared, from `formOf` in core-omr.
   *
   * `undefined` means the sheet prints no version box, which is the single form
   * case and stays exactly as it was. `null` means it prints one and the paper
   * did not answer it. A string is what the paper said.
   */
  sheetForm?: string | null,
): Grade {
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

  // `undefined` is not a fault. A sheet with no version box has nothing to say
  // about forms, and demanding one would refuse every quick20 in the product.
  const formFault: Grade['formFault'] =
    sheetForm === undefined
      ? 'none'
      : sheetForm === null
        ? 'unreadable'
        : sheetForm === key.form
          ? 'none'
          : 'mismatch';

  return {
    score,
    total: totalPointsOf(key),
    questions,
    unresolved,
    blanks,
    reviews,
    // A form fault outranks the question count. Every answer on the paper may be
    // clean and the grade still cannot stand.
    needsReview: reviews > 0 || formFault !== 'none',
    formFault,
  };
}

/**
 * The same thing from what the database holds, which is the re-grading path.
 *
 * Null for a stored string that does not decode to this key's question count,
 * because a score computed against the wrong sheet looks exactly like a real
 * one, and this is the only place that can still tell.
 *
 * `sheetForm` rides through unchanged, in `formOf`'s vocabulary. It has to:
 * re-grading is the same function run later over the same record, and a stored
 * path that dropped the form would clear a form fault the device raised, on the
 * exact screen a teacher trusts to re-mark a class.
 */
export function gradeStored(
  key: AnswerKey,
  stored: string,
  marks = '',
  sheetForm?: string | null,
): Grade | null {
  const answers = decodeAnswers(stored, key.questions.length);
  return answers === null ? null : gradeAnswers(key, answers, marks, sheetForm);
}
