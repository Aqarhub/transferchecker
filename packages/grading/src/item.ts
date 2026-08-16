// Item analysis, computed from the stored answer strings and nothing else.
//
// PLAN.md section 5 promised exactly this: there is no row per question in the
// database, and item analysis is computed from the strings on demand. This file
// is that promise kept, and it is why the encoding had to be lossless.
//
// Three decisions here are about honesty rather than statistics, and each one
// is a place where a confident wrong number would otherwise leave the building.
//
// A QUESTION THE MACHINE WOULD NOT DECIDE IS NOT A WRONG ANSWER. It is OUR
// failure, not the student's, and letting it into a difficulty would turn our
// uncertainty into their mistake and then into a teacher's judgement about a
// question. It is counted, reported and excluded.
//
// A BLANK IS NOT AN UNRESOLVED. A student who left a question told us
// something, so a blank carries its zero into the correlation and stays out of
// the difficulty, which is measured over the students who attempted.
//
// AND AN INDEX ON THIRTY STUDENTS IS NOISE. The standard error of a correlation
// at n = 30 is about 0.19, so an item that discriminates at 0.30 and one that
// discriminates at 0.00 are not distinguishable in one classroom. Below the
// floor these come back null rather than as a number a teacher would act on,
// the same way the golden set's accuracy gates stay disarmed until they can be
// met honestly.

import type { Answer } from './answers';
import type { Grade } from './grade';
import { unkeyed } from './key';
import type { AnswerKey, QuestionKey } from './key';

/**
 * Papers below which no index is reported at all.
 *
 * Thirty is a class and it is still small for this. The floor is not a claim
 * that 25 papers make an index trustworthy; it is the point below which it is
 * certainly not, and the report says which side it is on.
 */
export const MIN_PAPERS_FOR_INDICES = 25;

/** The share of the class taken as the top and bottom groups. Kelley's 27. */
const GROUP_SHARE = 0.27;

export interface AnalysedPaper {
  readonly answers: readonly Answer[];
  readonly grade: Grade;
}

export interface OptionCount {
  /** The bubble, or null for the students who left the question. */
  readonly index: number | null;
  readonly chosen: number;
  /** Mean total of the students who chose it, excluding this question. */
  readonly meanRest: number | null;
}

export interface ItemStats {
  readonly question: number;
  readonly papers: number;
  /** The student made a mark, and the machine read it. */
  readonly attempted: number;
  readonly omitted: number;
  /** The machine would not decide. Ours, and excluded from every rate below. */
  readonly unresolved: number;
  readonly correct: number;
  /** Correct over attempted. High is easy. Null when nobody attempted it. */
  readonly difficulty: number | null;
  /**
   * Corrected item total correlation: this question against the REST of the
   * paper, never against a total that contains it. An uncorrected coefficient
   * correlates a question with itself and flatters every item on a short test,
   * which is exactly the length of test this product marks.
   */
  readonly discrimination: number | null;
  /** The older index: right in the top 27 percent minus right in the bottom. */
  readonly upperLower: number | null;
  readonly options: readonly OptionCount[];
  /**
   * A distractor that the stronger students chose more than the key did.
   *
   * The likeliest cause is a miskeyed question, which is a teacher's mistake
   * this product can catch and which otherwise marks a whole class wrong.
   */
  readonly suspectKey: boolean;
}

export interface ItemAnalysis {
  readonly papers: number;
  readonly items: readonly ItemStats[];
  /**
   * Cronbach's alpha over item scores, which is KR-20 when every item is worth
   * one point. One formula for both, since this product weights questions.
   */
  readonly reliability: number | null;
  /** False while the class is too small for a discrimination index to mean anything. */
  readonly indicesArmed: boolean;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const variance = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const average = mean(values);
  return mean(values.map((value) => (value - average) ** 2));
};

/** Pearson, and null where either side never varies. */
function correlation(left: readonly number[], right: readonly number[]): number | null {
  if (left.length < 2 || left.length !== right.length) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  let top = 0;
  let leftSum = 0;
  let rightSum = 0;
  for (const [at, value] of left.entries()) {
    const a = value - leftMean;
    const b = (right[at] ?? 0) - rightMean;
    top += a * b;
    leftSum += a * a;
    rightSum += b * b;
  }
  // A question everybody got right, or a class where everybody scored the same:
  // there is no relationship to measure, and zero would be a claim.
  if (leftSum === 0 || rightSum === 0) return null;
  return top / Math.sqrt(leftSum * rightSum);
}

/** The bubble a paper carries for one question, or null for a blank. */
function chosenOf(answer: Answer | undefined): readonly number[] | null {
  if (answer === undefined) return null;
  if (answer.kind === 'one') return [answer.index];
  if (answer.kind === 'many') return answer.indexes;
  return null;
}

function optionsOf(
  papers: readonly AnalysedPaper[],
  at: number,
  rest: readonly number[],
): OptionCount[] {
  const tally = new Map<number | null, { chosen: number; rest: number[] }>();
  for (const [paper, entry] of papers.entries()) {
    const answer = entry.answers[at];
    if (answer?.kind === 'unresolved') continue;
    const chosen = chosenOf(answer);
    const keys: (number | null)[] = chosen === null ? [null] : [...chosen];
    for (const key of keys) {
      const held = tally.get(key) ?? { chosen: 0, rest: [] };
      held.chosen += 1;
      held.rest.push(rest[paper] ?? 0);
      tally.set(key, held);
    }
  }
  return [...tally.entries()]
    .map(([index, held]) => ({
      index,
      chosen: held.chosen,
      meanRest: held.rest.length === 0 ? null : mean(held.rest),
    }))
    .sort((left, right) => (left.index ?? 99) - (right.index ?? 99));
}

/** Whether this bubble is one the key calls right. */
function isKeyed(question: QuestionKey, index: number): boolean {
  const intended = question.intended;
  if (intended === null) return false;
  return Array.isArray(intended) ? intended.includes(index) : intended === index;
}

/**
 * The whole analysis.
 *
 * The key is passed rather than inferred from the papers. Inferring it would
 * mean reading the answer back out of the grades, and this file exists partly
 * to catch a MISKEYED question: a check that derives the key from the marking
 * cannot notice that the marking is wrong.
 *
 * Every paper must have been graded against this key, which the caller owns:
 * mixing two forms here would average two different questions into one item.
 */
export function analyseItems(key: AnswerKey, papers: readonly AnalysedPaper[]): ItemAnalysis {
  const count = key.questions.length;
  const indicesArmed = papers.length >= MIN_PAPERS_FOR_INDICES;
  const items: ItemStats[] = [];

  for (let at = 0; at < count; at += 1) {
    const question = key.questions[at] ?? unkeyed();
    // A paper the machine could not read on THIS question leaves this question's
    // statistics entirely, and keeps its place in every other one.
    const usable = papers.filter((paper) => paper.answers[at]?.kind !== 'unresolved');
    const scores = usable.map((paper) => paper.grade.questions[at]?.awarded ?? 0);
    const rest = usable.map(
      (paper) => paper.grade.score - (paper.grade.questions[at]?.awarded ?? 0),
    );

    const attempted = usable.filter((paper) => chosenOf(paper.answers[at]) !== null).length;
    const correct = usable.filter((paper) => paper.grade.questions[at]?.correct === true).length;
    const options = optionsOf(usable, at, rest);

    // A distractor whose choosers beat the key's choosers on the rest of the
    // paper. Two of them at least, so one strong student having a bad moment is
    // not a reason to tell a teacher their key is wrong.
    const keyMean = options
      .filter((option) => option.index !== null && isKeyed(question, option.index))
      .flatMap((option) => (option.meanRest === null ? [] : [option.meanRest]));
    const best = keyMean.length === 0 ? null : Math.max(...keyMean);
    const suspectKey =
      best !== null &&
      options.some(
        (option) =>
          option.index !== null &&
          !isKeyed(question, option.index) &&
          option.meanRest !== null &&
          option.chosen >= 2 &&
          option.meanRest > best,
      );

    const sorted = [...usable].sort((left, right) => right.grade.score - left.grade.score);
    const group = Math.max(1, Math.round(sorted.length * GROUP_SHARE));
    const rightIn = (slice: readonly AnalysedPaper[]): number =>
      slice.length === 0
        ? 0
        : slice.filter((paper) => paper.grade.questions[at]?.correct === true).length /
          slice.length;

    items.push({
      question: at + 1,
      papers: papers.length,
      attempted,
      omitted: usable.filter((paper) => paper.answers[at]?.kind === 'blank').length,
      unresolved: papers.length - usable.length,
      correct,
      difficulty: attempted === 0 ? null : correct / attempted,
      discrimination: indicesArmed ? correlation(scores, rest) : null,
      upperLower: indicesArmed
        ? rightIn(sorted.slice(0, group)) - rightIn(sorted.slice(-group))
        : null,
      options,
      suspectKey,
    });
  }

  return { papers: papers.length, items, reliability: alphaOf(papers, count), indicesArmed };
}

/**
 * Cronbach's alpha, over COMPLETE papers only.
 *
 * A paper with an unresolved question has a hole in it, and the two ways of
 * filling that hole are both wrong: scoring it zero says the student failed a
 * question we could not read, and dropping the question drops it for the whole
 * class. So the paper leaves this statistic and stays in every per item one,
 * which is the same rule the items use one column at a time.
 *
 * Null where it would be a division by nothing: fewer than two questions, fewer
 * than two complete papers, or a class where every total is identical.
 */
function alphaOf(papers: readonly AnalysedPaper[], count: number): number | null {
  const complete = papers.filter((paper) =>
    paper.answers.every((answer) => answer.kind !== 'unresolved'),
  );
  if (count < 2 || complete.length < 2) return null;

  const perItem = Array.from({ length: count }, (_, at) =>
    complete.map((paper) => paper.grade.questions[at]?.awarded ?? 0),
  );
  const totals = complete.map((paper) =>
    paper.grade.questions.reduce((sum, entry) => sum + entry.awarded, 0),
  );
  const totalVariance = variance(totals);
  if (totalVariance === 0) return null;
  const itemVariance = perItem.reduce((sum, scores) => sum + variance(scores), 0);
  return (count / (count - 1)) * (1 - itemVariance / totalVariance);
}
