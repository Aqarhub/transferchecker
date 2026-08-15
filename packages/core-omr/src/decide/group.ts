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

function decideMany(input: GroupInput, thresholds: Thresholds): GroupOutcome {
  const indexes: number[] = [];
  let margin = 1;
  let uncertain = false;

  for (const [index, reading] of input.readings.entries()) {
    const on = reading.fill >= thresholds.manyOn;
    const off = reading.fill <= thresholds.manyOff;
    if (on) indexes.push(index);
    // The gap between on and off is the grey band, and a bubble sitting in it
    // is exactly what "do not guess" was written for.
    if (!on && !off) uncertain = true;
    const distance = on
      ? reading.fill - thresholds.manyOn
      : off
        ? thresholds.manyOff - reading.fill
        : 0;
    margin = Math.min(margin, distance);
  }

  if (indexes.length === 0) {
    return { kind: 'blank', margin, trace: hasTrace(input, thresholds, -1) };
  }
  return {
    kind: 'multiple',
    indexes,
    symbols: indexes.map((index) => at(input.symbols, index) ?? '?'),
    margin,
    uncertain: uncertain || margin < thresholds.uncertainMargin,
  };
}

/** A bubble that is not the answer but carries more ink than clean paper does. */
function hasTrace(input: GroupInput, thresholds: Thresholds, winner: number): boolean {
  return input.readings.some(
    (reading, index) =>
      index !== winner && reading.fill >= thresholds.traceInk && reading.fill < thresholds.minInk,
  );
}

export function decideGroup(input: GroupInput, thresholds: Thresholds): GroupOutcome {
  if (input.readings.length === 0) return { kind: 'blank', margin: 1, trace: false };

  const worst = Math.max(...input.readings.map((reading) => reading.saturation));
  if (worst > thresholds.maxSaturation) return { kind: 'unmeasurable', worst };

  if (input.many) return decideMany(input, thresholds);

  const fills = input.readings.map((reading) => reading.fill);
  const top = Math.max(...fills);

  if (top < thresholds.minInk) {
    return {
      kind: 'blank',
      margin: thresholds.minInk - top,
      trace: hasTrace(input, thresholds, -1),
    };
  }

  const lowest = Math.min(...fills);
  if (lowest >= thresholds.minInk) {
    // Every bubble is marked. The old rule would have taken the darkest.
    return { kind: 'ambiguous', reason: 'all_marked', margin: lowest - thresholds.minInk };
  }

  let winner = 0;
  for (const [index, fill] of fills.entries()) if (fill > (fills[winner] ?? 0)) winner = index;
  const second = Math.max(...fills.filter((_, index) => index !== winner), 0);

  // The winner's own ratio is one by construction, so the two live constraints
  // are the floor underneath it and the runner up behind it. The margin is the
  // nearer of the two, in ink units so it can be compared with the floor.
  const floorMargin = top - thresholds.minInk;
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
    escaped: (reading?.escape ?? 0) >= thresholds.escapeInk,
    trace: hasTrace(input, thresholds, winner),
  };
}

/** One character per question, the alphabet defense د20 asks the record to keep. */
export function markOf(outcome: GroupOutcome): string {
  switch (outcome.kind) {
    case 'blank':
      return outcome.trace ? 'e' : 'b';
    case 'answer':
      return outcome.uncertain ? 'u' : outcome.trace || outcome.escaped ? 'e' : 'c';
    case 'multiple':
      return outcome.uncertain ? 'u' : 'c';
    case 'ambiguous':
      return 'd';
    case 'unmeasurable':
      return 'u';
  }
}
