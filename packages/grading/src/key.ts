// The answer key, which is a table of points per question and not a letter.
//
// PLAN.md section 5 settled this against three inputs we watched a competitor's
// editor accept for one question (notes 58 to 63): the intended answer with its
// points, ALTERNATE answers each with points of their own rather than the
// intended one's, and wrong answers granted a value that may be NEGATIVE. A
// single letter per question cannot say any of that, so the model is a map from
// bubble index to points, and the intended answer is only the entry the teacher
// marked. It is needed for item analysis, not for grading.
//
// Two things the plan is explicit about and this file keeps:
//
// The MAXIMUM points of a question are DERIVED and never stored, because
// storing what can be computed opens a door to two answers disagreeing.
//
// And the storage shape stays a string plus three sparse columns, because the
// overwhelmingly common question has one answer worth one point. That case pays
// one character; a question with alternates pays for itself alone.
//
// Alternates are also why re-grading exists at all: a teacher who finds a badly
// worded question AFTER marking a class adds a second acceptable answer, and
// every stored answer string is scored again with no paper rescanned.

import { z } from 'zod';
import { MAX_SYMBOLS } from '@transferchecker/sheet-spec';
import { decodeAnswers, encodeAnswer } from './answers';
import type { Answer } from './answers';

const bubbleIndex = z
  .number()
  .int()
  .min(0)
  .max(MAX_SYMBOLS - 1);

/** Points granted for one bubble, which may be negative where guessing is penalised. */
export const AwardSchema = z.object({
  index: bubbleIndex,
  points: z.number().min(-100).max(100),
});

export const QuestionKeySchema = z.object({
  /**
   * What the teacher says is right, and null for a question left unkeyed.
   *
   * Unkeyed is a real state and not a mistake: a key built by scanning a solved
   * sheet has whatever the teacher shaded, and a question they skipped has no
   * answer yet. It scores zero out of zero rather than zero out of one, so an
   * unfinished key never quietly deflates a class.
   */
  intended: z.union([bubbleIndex, z.array(bubbleIndex).min(1)]).nullable(),
  /** Points for the intended answer. One, unless the teacher weighted it. */
  points: z.number().min(-100).max(100),
  /** Every other bubble that is worth something, right or wrong. */
  awards: z.array(AwardSchema),
  /** What this question tests, for the report a teacher actually asks for. */
  tags: z.array(z.string().min(1).max(40)),
});

export const AnswerKeySchema = z.object({
  /** Which printed form this key applies to, from the sheet's own version bubble. */
  form: z.string().min(1).max(4),
  questions: z.array(QuestionKeySchema).min(1).max(200),
});

export type Award = z.output<typeof AwardSchema>;
export type QuestionKey = z.output<typeof QuestionKeySchema>;
export type AnswerKey = z.output<typeof AnswerKeySchema>;

/** A question nobody has keyed yet: worth nothing, out of nothing. */
export function unkeyed(): QuestionKey {
  return { intended: null, points: 1, awards: [], tags: [] };
}

/**
 * The points a bubble earns, from the one table that decides it.
 *
 * The intended answer of a `select: 'many'` question is a SET, and every member
 * of it earns the question's points. Reading only the single answer case here
 * was a real defect: [measured] a two bubble question scored zero for a
 * perfectly correct paper, because neither of its right bubbles was `intended`
 * by identity and neither had an entry in `awards`.
 */
export function pointsFor(question: QuestionKey, index: number): number {
  const intended = question.intended;
  const isIntended =
    intended !== null && (Array.isArray(intended) ? intended.includes(index) : intended === index);
  if (isIntended) return question.points;
  return question.awards.find((award) => award.index === index)?.points ?? 0;
}

/**
 * The most a question can be worth, derived.
 *
 * For a single answer question it is the best single entry in the table. For a
 * `select: 'many'` question it is the sum of every positive entry, because that
 * question is scored bubble by bubble: choosing all that apply is a series of
 * decisions and a teacher who penalises a wrong tick expects the right ones to
 * still count. Never below zero, so a question whose every entry is a penalty
 * is worth nothing rather than owing the student marks.
 */
export function maxPointsOf(question: QuestionKey): number {
  if (question.intended === null) return 0;
  if (Array.isArray(question.intended)) {
    const positive = [question.points, ...question.awards.map((award) => award.points)].filter(
      (points) => points > 0,
    );
    const each = question.intended.length * Math.max(0, question.points);
    const extras = question.awards
      .filter((award) => award.points > 0)
      .reduce((sum, award) => sum + award.points, 0);
    return positive.length === 0 ? 0 : each + extras;
  }
  return Math.max(0, question.points, ...question.awards.map((award) => award.points));
}

/** The whole paper's ceiling, which is what a score is out of. */
export function totalPointsOf(key: AnswerKey): number {
  return key.questions.reduce((sum, question) => sum + maxPointsOf(question), 0);
}

/**
 * The key as PLAN.md section 5 stores it.
 *
 * `key` carries the intended answers in the same encoding a paper uses, so a
 * key and a paper are never compared across two alphabets. `points` is dense
 * because every question has one. `awards` and `tags` are sparse objects keyed
 * by question number, and cost nothing on the sheets that do not use them.
 */
export interface StoredKey {
  readonly form: string;
  readonly key: string;
  readonly points: readonly number[];
  readonly extras: Readonly<Record<string, readonly Award[]>>;
  readonly tags: Readonly<Record<string, readonly string[]>>;
}

const intendedAnswer = (question: QuestionKey): Answer => {
  if (question.intended === null) return { kind: 'blank' };
  if (Array.isArray(question.intended)) return { kind: 'many', indexes: question.intended };
  return { kind: 'one', index: question.intended };
};

export function toStored(key: AnswerKey): StoredKey {
  const extras: Record<string, readonly Award[]> = {};
  const tags: Record<string, readonly string[]> = {};
  for (const [at, question] of key.questions.entries()) {
    const number = String(at + 1);
    if (question.awards.length > 0) extras[number] = question.awards;
    if (question.tags.length > 0) tags[number] = question.tags;
  }
  return {
    form: key.form,
    key: key.questions.map((question) => encodeAnswer(intendedAnswer(question))).join(''),
    points: key.questions.map((question) => question.points),
    extras,
    tags,
  };
}

/** Null for a stored key whose three columns disagree about how many questions there are. */
export function fromStored(stored: StoredKey): AnswerKey | null {
  const intended = decodeAnswers(stored.key, stored.points.length);
  if (intended === null) return null;

  const questions: QuestionKey[] = intended.map((answer, at) => {
    const number = String(at + 1);
    return {
      intended:
        answer.kind === 'one' ? answer.index : answer.kind === 'many' ? [...answer.indexes] : null,
      points: stored.points[at] ?? 1,
      awards: [...(stored.extras[number] ?? [])],
      tags: [...(stored.tags[number] ?? [])],
    };
  });
  const parsed = AnswerKeySchema.safeParse({ form: stored.form, questions });
  return parsed.success ? parsed.data : null;
}
