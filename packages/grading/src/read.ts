// The one place the engine's reading becomes a stored answer.
//
// It is a file of its own because it is a decision and not plumbing: which
// outcomes carry a letter forward, and which are refused. Written anywhere else
// it would be written twice, and the second copy would be the one that decides
// a grade on a phone.
//
// The dependency on `core-omr` here is TYPE ONLY, and `verbatimModuleSyntax`
// erases it, so nothing in this package pulls the scanning engine into a
// bundle. The web dashboard re-grades from stored strings and never loads it,
// and `test/layering.test.ts` fails the build if a value import ever appears.
//
// The rule, from `PLAN.md` section 4 rule 6 and defense د8: a bubble between
// the two decision thresholds is FLAGGED and shown, never settled quietly. So
// an uncertain answer keeps its letter and carries a review flag, while a
// question the engine would not decide carries no letter at all.

import type { GroupOutcome } from '@transferchecker/core-omr';
import type { Answer } from './answers';

/**
 * Defense د20's alphabet, as the predicate this package needs from it.
 *
 * A question warns when its stored character is anything but a clean answer or
 * a blank. It is the same predicate the golden set's warning budget counts, and
 * it is written once so the number a teacher sees and the number a build gates
 * on can never mean two different things.
 */
export function marksReview(mark: string): boolean {
  return mark !== 'c' && mark !== 'b';
}

/** One group's outcome as the answer that gets stored. */
export function answerOf(outcome: GroupOutcome): Answer {
  switch (outcome.kind) {
    case 'answer':
      // Uncertain keeps its letter. The flag rides in the marks string, and
      // dropping the letter here would turn a doubt into a lost mark, which is
      // the failure acceptance criterion 11 names from the other side.
      return { kind: 'one', index: outcome.index };
    case 'multiple':
      return { kind: 'many', indexes: outcome.indexes };
    case 'blank':
      return { kind: 'blank' };
    case 'ambiguous':
    case 'unmeasurable':
      return { kind: 'unresolved' };
  }
}

/** A whole sheet's questions as answers, in the order the sheet prints them. */
export function answersOf(
  questions: readonly { readonly question: number; readonly outcome: GroupOutcome }[],
): Answer[] {
  return [...questions]
    .sort((left, right) => left.question - right.question)
    .map((entry) => answerOf(entry.outcome));
}
