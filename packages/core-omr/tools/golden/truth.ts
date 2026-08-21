// What a golden case is supposed to say, and how a reading is scored against it.
//
// The one rule this file exists to enforce: **the truth comes from the marks
// the case asked the renderer to draw, and never from the engine**. If the
// expected answer were derived from a scan, a suite of any size would only ever
// prove that the engine agrees with itself, and every threshold in the package
// could be tuned until it did.
//
// The second rule is that a case designed to be doubtful is not scored as if it
// were certain. A mark drawn at a quarter of a bubble is a real thing a student
// does and the honest expectation is "not a confident wrong letter", not "blank"
// and not "answer": pretending otherwise would push the golden set toward
// whichever threshold happened to be in the code the day it was written.

import type { GroupOutcome } from '../../src/decide/group';
import type { PencilMark } from '../render';

/** Coverage at or above which a drawn mark is unambiguously a mark. */
export const SOLID_COVERAGE = 0.6;

/** And the grey value at or above which graphite is too faint to insist on. */
export const FAINT_VALUE = 150;

export type Expected =
  /** Exactly one solid mark was drawn: this letter, and nothing else, is right. */
  | { readonly kind: 'answer'; readonly symbol: string }
  /** Nothing was drawn. A letter here is a silent wrong answer, the worst outcome. */
  | { readonly kind: 'blank' }
  /** Two solid marks, or a scribble: any confident single letter is wrong. */
  | { readonly kind: 'flagged'; readonly why: string }
  /**
   * Drawn on purpose at the edge of what a mark is. Blank and the drawn letter
   * are both acceptable; a DIFFERENT letter is not, and neither is a confident
   * letter where the drawing was an erasure.
   */
  | { readonly kind: 'either'; readonly symbol: string; readonly why: string };

export type Verdict =
  /** The engine said what the paper says, with confidence. */
  | 'correct'
  /** Right, or honestly doubtful, but it costs the teacher a look. */
  | 'flagged'
  /**
   * The engine had the answer and gave it up IN SILENCE: read as blank, with
   * nothing on the record to say so.
   *
   * The silence is the whole of it. `report.ts` adds this to `wrong` and calls
   * the sum "misgraded in silence", so a loss the teacher was told about must
   * never land here: a blank carrying `trace` is published as the mark
   * character `e`, which is a flag on the teacher's screen, and counting that
   * as silent charges the engine for a warning it did give.
   */
  | 'missed'
  /** A confident letter that is not what the paper says. This must be zero. */
  | 'wrong';

const solid = (mark: PencilMark): boolean =>
  mark.erased !== true && mark.coverage >= SOLID_COVERAGE && mark.value <= FAINT_VALUE;

/**
 * The expected outcome of one group, from the marks aimed at it.
 *
 * Pure, and deliberately dull: every branch is a sentence about paper, not
 * about the engine's rules. An erased mark is not an answer no matter how heavy
 * it is, because the student rubbed it out.
 */
export function expectedOf(marks: readonly PencilMark[]): Expected {
  const drawn = marks.filter((mark) => mark.coverage > 0);
  if (drawn.length === 0) return { kind: 'blank' };

  // By distinct SYMBOL, not by mark count. Two strokes aimed at one bubble are
  // one shaded bubble, and counting them as two answers is how a corpus starts
  // accusing the engine of its own bookkeeping. [measured] It did exactly that
  // on the first run of the sweep.
  const answers = drawn.filter(solid);
  const symbols = new Set(answers.map((mark) => mark.symbol));
  if (symbols.size > 1) {
    return { kind: 'flagged', why: `${String(symbols.size)} bubbles shaded` };
  }

  const first = answers[0];
  if (first !== undefined) {
    // A ghost is ink on a DIFFERENT bubble. Ink on the same one, however many
    // strokes it took, is the same shading and says nothing doubtful.
    const ghosts = drawn.filter((mark) => mark.symbol !== first.symbol);
    // A rubbed out neighbour may legitimately raise a flag, so the sheet is
    // allowed to be doubtful, but it may never carry the ghost's letter.
    if (ghosts.length > 0) {
      return { kind: 'either', symbol: first.symbol, why: 'an erased or faint neighbour' };
    }
    return { kind: 'answer', symbol: first.symbol };
  }

  const faint = drawn[0];
  if (faint === undefined) return { kind: 'blank' };
  return {
    kind: 'either',
    symbol: faint.symbol,
    why: faint.erased === true ? 'an erasure only' : 'drawn below a solid mark',
  };
}

/** Whether an outcome names this symbol at all, however it names it. */
export function names(outcome: GroupOutcome, symbol: string): boolean {
  if (outcome.kind === 'answer') return outcome.symbol === symbol;
  if (outcome.kind === 'multiple') return outcome.symbols.includes(symbol);
  return false;
}

/**
 * Scoring one group. The asymmetry is the whole point: a doubt costs a look and
 * a confident mistake costs a grade, so they can never share a bucket.
 */
export function verdictOf(expected: Expected, outcome: GroupOutcome): Verdict {
  if (outcome.kind === 'unmeasurable') return 'flagged';

  switch (expected.kind) {
    case 'answer': {
      if (outcome.kind === 'answer' && outcome.symbol === expected.symbol) {
        return outcome.uncertain ? 'flagged' : 'correct';
      }
      // A blank the engine flagged is not a silent loss. See `Verdict`.
      if (outcome.kind === 'blank') return outcome.trace ? 'flagged' : 'missed';
      if (outcome.kind === 'ambiguous') return 'flagged';
      // An answer or a multiple naming a letter the student did not shade.
      return 'wrong';
    }
    case 'blank': {
      if (outcome.kind === 'blank') return 'correct';
      if (outcome.kind === 'ambiguous') return 'flagged';
      return 'wrong';
    }
    case 'flagged': {
      if (outcome.kind === 'ambiguous' || outcome.kind === 'multiple') return 'correct';
      if (outcome.kind === 'blank') return outcome.trace ? 'flagged' : 'missed';
      return 'wrong';
    }
    case 'either': {
      if (outcome.kind === 'blank' || outcome.kind === 'ambiguous') return 'flagged';
      return names(outcome, expected.symbol) ? 'correct' : 'wrong';
    }
  }
}
