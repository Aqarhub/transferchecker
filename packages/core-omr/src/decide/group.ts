// Deciding one group of bubbles.
//
// A group is a question, or one character column of a grid field. The rule is
// defense د8, and its shape matters more than its numbers:
//
//   1. Any bubble the glare destroyed makes the whole group unmeasurable, and
//      that travels up to reject the frame rather than the question (د10).
//   2. If the darkest bubble is under the absolute ink floor, the group is
//      BLANK. Not "the largest wins", not "ambiguous": blank is a third state
//      and it is the student's own decision, recorded as such.
//   3. If EVERY bubble clears the floor, the group is ambiguous. The old rule
//      would have picked the darkest, which is how a scribbled out row becomes
//      a confident wrong answer.
//   4. Only then is a ratio computed, and only inside the group.
//
// The decision margin comes out with the answer, in ink units, and is the
// distance to the nearest threshold the decision would have had to cross. A
// paper whose margins are all wide gives the same answer under any small
// disturbance, which is what acceptance criteria 12 and 13 actually ask for.

import type { BubbleReading } from '../measure/bubble';
import type { Thresholds } from './thresholds';

export type GroupOutcome =
  | { readonly kind: 'blank'; readonly margin: number; readonly trace: boolean }
  | {
      readonly kind: 'answer';
      readonly index: number;
      readonly symbol: string;
      readonly margin: number;
      readonly uncertain: boolean;
      readonly escaped: boolean;
      readonly trace: boolean;
    }
  | {
      readonly kind: 'multiple';
      readonly indexes: readonly number[];
      readonly symbols: readonly string[];
      readonly margin: number;
      readonly uncertain: boolean;
    }
  | {
      readonly kind: 'ambiguous';
      readonly reason: 'all_marked' | 'two_close';
      readonly margin: number;
    }
  | { readonly kind: 'unmeasurable'; readonly worst: number };

export interface GroupInput {
  readonly symbols: readonly string[];
  readonly readings: readonly BubbleReading[];
  /** A question that asks for several answers, where several marks are the answer. */
  readonly many: boolean;
}

const at = <T>(list: readonly T[], index: number): T | undefined => list[index];

/**
 * The floor this group is actually judged against, in ink units.
 *
 * Two floors, and the stricter wins. `minInk` is a fraction of this sheet's own
 * paper to toner swing, which is the only way an absolute number survives a
 * shadow. `minAbsDark` is a number of grey levels, which is the only way a
 * fraction survives weak toner: at the 40 level separation the photometry stage
 * still accepts, 0.25 ink is ten grey levels, and ten levels is dust.
 *
 * Expressed as one number rather than as a second comparison because every rule
 * below it, blank, all marked, the floor margin and the trace flag, is written
 * against a floor in ink units, and giving them the raised floor keeps one rule
 * instead of two that can disagree.
 */
function inkFloorOf(input: GroupInput, thresholds: Thresholds): number {
  // The weakest reference in the group decides, because a floor that holds for
  // the best lit bubble of a group and not the worst is not a floor.
  const spans = input.readings.map((reading) => reading.spanLevels).filter((span) => span > 0);
  if (spans.length === 0) return thresholds.minInk;
  return Math.max(thresholds.minInk, thresholds.minAbsDark / Math.min(...spans));
}

function decideMany(input: GroupInput, thresholds: Thresholds): GroupOutcome {
  // The absolute floor applies here too: on a weak sheet the "on" threshold is
  // raised to whatever fraction 18 grey levels comes to.
  const onLevel = Math.max(thresholds.manyOn, inkFloorOf(input, thresholds));
  const indexes: number[] = [];
  let margin = 1;
  let uncertain = false;

  for (const [index, reading] of input.readings.entries()) {
    const on = reading.fill >= onLevel;
    const off = reading.fill <= thresholds.manyOff;
    if (on) indexes.push(index);
    // The gap between on and off is the grey band, and a bubble sitting in it
    // is exactly what "do not guess" was written for.
    if (!on && !off) uncertain = true;
    const distance = on ? reading.fill - onLevel : off ? thresholds.manyOff - reading.fill : 0;
    margin = Math.min(margin, distance);
  }

  if (indexes.length === 0) {
    return { kind: 'blank', margin, trace: hasTrace(input, thresholds, -1, onLevel) };
  }
  return {
    kind: 'multiple',
    indexes,
    symbols: indexes.map((index) => at(input.symbols, index) ?? '?'),
    margin,
    uncertain: uncertain || margin < thresholds.uncertainMargin,
  };
}

/**
 * A bubble that is not the answer but carries more ink than clean paper does.
 *
 * The trace threshold needs the same absolute companion the answer floor has,
 * and it was left without one. [measured] On a quick20 sheet rendered at a
 * printed contrast of 96 and below, EVERY question came back `e`, answered and
 * blank alike, and rendering the identical sheet with `labels: false` came back
 * clean at every toner level: the cause is the printed letter inside the
 * bubble. It covers 0.9 mm2 of the 7.069 mm2 disc, so it darkens the disc by a
 * constant 11.5 grey levels whatever the toner does, and as a FRACTION that is
 * 0.119 at contrast 96 against a raw threshold of 0.10.
 *
 * Reusing `minAbsDark` rather than inventing a second number: it is the same
 * sentence, that this much ink is really on the paper, and 18 levels clears the
 * label's 11.5 with room. [measured] At the default contrast of 196 it changes
 * nothing, because 18 / 196 = 0.092 is under the 0.10 that was already there.
 */
function hasTrace(
  input: GroupInput,
  thresholds: Thresholds,
  winner: number,
  floor: number,
): boolean {
  const spans = input.readings.map((reading) => reading.spanLevels).filter((span) => span > 0);
  const traceFloor =
    spans.length === 0
      ? thresholds.traceInk
      : Math.max(thresholds.traceInk, thresholds.minAbsDark / Math.min(...spans));
  return input.readings.some(
    (reading, index) => index !== winner && reading.fill >= traceFloor && reading.fill < floor,
  );
}

export function decideGroup(input: GroupInput, thresholds: Thresholds): GroupOutcome {
  if (input.readings.length === 0) return { kind: 'blank', margin: 1, trace: false };

  const worst = Math.max(...input.readings.map((reading) => reading.saturation));
  if (worst > thresholds.maxSaturation) return { kind: 'unmeasurable', worst };

  if (input.many) return decideMany(input, thresholds);

  const floor = inkFloorOf(input, thresholds);
  const fills = input.readings.map((reading) => reading.fill);
  const top = Math.max(...fills);

  if (top < floor) {
    return {
      kind: 'blank',
      margin: floor - top,
      trace: hasTrace(input, thresholds, -1, floor),
    };
  }

  const lowest = Math.min(...fills);
  if (lowest >= floor) {
    // Every bubble is marked. The old rule would have taken the darkest.
    return { kind: 'ambiguous', reason: 'all_marked', margin: lowest - floor };
  }

  let winner = 0;
  for (const [index, fill] of fills.entries()) if (fill > (fills[winner] ?? 0)) winner = index;
  const second = Math.max(...fills.filter((_, index) => index !== winner), 0);

  // The winner's own ratio is one by construction, so the two live constraints
  // are the floor underneath it and the runner up behind it. The margin is the
  // nearer of the two, in ink units so it can be compared with the floor.
  const floorMargin = top - floor;
  const runnerUpMargin = thresholds.runnerUpRatio * top - second;
  if (runnerUpMargin < 0) {
    return { kind: 'ambiguous', reason: 'two_close', margin: -runnerUpMargin };
  }

  const reading = at(input.readings, winner);
  const margin = Math.min(floorMargin, runnerUpMargin);
  return {
    kind: 'answer',
    index: winner,
    symbol: at(input.symbols, winner) ?? '?',
    margin,
    uncertain: margin < thresholds.uncertainMargin,
    escaped: reading?.escapeMeasured === true && reading.escape >= thresholds.escapeInk,
    trace: hasTrace(input, thresholds, winner, floor),
  };
}

/**
 * One character per question, the record defense د20 asks the paper to keep.
 *
 *   c  clean          the rule decided it with room to spare
 *   u  uncertain      decided, but close to a threshold or not stable
 *   d  double         ambiguous: two marks close, or every bubble marked
 *   b  blank          the student left it, and that is their decision
 *   e  eraser trace   ink under the floor that is not the answer
 *   x  escaped        the mark left its bubble: a circle, a cross, rough work
 *
 * SIX symbols where د20 names five. The sixth is `x`, and the addition is
 * deliberate: defense د9 gives ink outside the bubble its own flag precisely so
 * it does not dissolve into the fill ratio, and د20's alphabet was written
 * before that flag had anywhere to live in the stored record. Folding `x` into
 * `e` would put a circled letter and a rubbed out answer under one character,
 * and the whole point of storing this string is that an appeal can ask which of
 * the two happened on question seven.
 *
 * Precedence runs from least to most specific: an uncertain answer is reported
 * as uncertain whatever else is true of it, because that is the flag the teacher
 * has to act on.
 */
export function markOf(outcome: GroupOutcome): string {
  switch (outcome.kind) {
    case 'blank':
      return outcome.trace ? 'e' : 'b';
    case 'answer':
      if (outcome.uncertain) return 'u';
      if (outcome.escaped) return 'x';
      return outcome.trace ? 'e' : 'c';
    case 'multiple':
      return outcome.uncertain ? 'u' : 'c';
    case 'ambiguous':
      return 'd';
    case 'unmeasurable':
      return 'u';
  }
}
