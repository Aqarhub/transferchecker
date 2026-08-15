// Can this suite tell a working engine from a broken one?
//
// A corpus that cannot fail proves nothing, and a green sweep is evidence of
// nothing until that question has an answer. So the engine is deliberately
// broken, one threshold at a time, and the suite is asked which breakages it
// notices.
//
// [measured] The first answer was bad. Of the mutants below, twelve of fourteen
// passed every armed gate on the sweep as first written, including one that
// blinded the engine completely: `minInk` at 0.99 reads NOTHING, 185 of 229
// answered questions come back blank, and it scored the BEST margin of any
// configuration tried, because a blank's margin is the distance down to the
// floor and raising the floor raises it. The leading indicator was rewarding
// blindness.
//
// What that produced: the margin is now taken over DECIDED answers only, and
// the answered accuracy ratchet was added. This file is what keeps the answer
// honest as the engine changes.

import type { Thresholds } from '../../src/decide/thresholds';
import { DEFAULT_THRESHOLDS } from '../../src/decide/thresholds';
import type { GoldenCase } from './corpus';
import { summarise } from './report';
import { runCase } from './score';

export interface Mutant {
  readonly id: string;
  /** What a person would be doing to the engine if they made this change. */
  readonly why: string;
  readonly thresholds: Thresholds;
}

const with_ = (patch: Partial<Thresholds>): Thresholds => ({ ...DEFAULT_THRESHOLDS, ...patch });

export const MUTANTS: readonly Mutant[] = [
  {
    id: 'blind-floor',
    why: 'the ink floor so high nothing is ever a mark',
    thresholds: with_({ minInk: 0.99 }),
  },
  {
    id: 'raised-floor',
    why: 'the ink floor at nearly twice its value',
    thresholds: with_({ minInk: 0.45 }),
  },
  {
    id: 'no-floor',
    why: 'the ink floor gone, so dust is an answer',
    thresholds: with_({ minInk: 0.01 }),
  },
  {
    id: 'no-absolute-floor',
    why: 'the grey level companion floor disabled',
    thresholds: with_({ minAbsDark: 1 }),
  },
  {
    id: 'flag-everything',
    why: 'the uncertainty margin so wide every answer is doubted',
    thresholds: with_({ uncertainMargin: 0.5 }),
  },
  {
    id: 'flag-nothing',
    why: 'the uncertainty margin at zero, so nothing is ever doubted',
    thresholds: with_({ uncertainMargin: 0 }),
  },
  {
    id: 'runner-up-blind',
    why: 'two marks close together accepted as one answer',
    thresholds: with_({ runnerUpRatio: 0.95 }),
  },
  {
    id: 'runner-up-paranoid',
    why: 'any second bubble at all makes the question ambiguous',
    thresholds: with_({ runnerUpRatio: 0.02 }),
  },
  {
    id: 'glare-blind',
    why: 'saturation ignored, so a blown out bubble is read as paper',
    thresholds: with_({ maxSaturation: 1 }),
  },
  {
    id: 'escape-blind',
    why: 'ink outside the bubble never flagged',
    thresholds: with_({ escapeInk: 0.99 }),
  },
  {
    id: 'trace-blind',
    why: 'an eraser ghost never flagged',
    thresholds: with_({ traceInk: 0.99 }),
  },
  {
    id: 'trace-paranoid',
    why: 'paper texture flagged as an eraser ghost',
    thresholds: with_({ traceInk: 0.01 }),
  },
];

/**
 * Which mutants the suite fails to notice, by id, in a stable order.
 *
 * A mutant counts as CAUGHT only when it fails a gate the unmutated engine
 * passes. Without that clause the measurement lies in the flattering direction:
 * [measured] on a five case probe set the baseline itself scores 97.26 percent
 * of 73 answered questions, under the 98 percent ratchet, because one case
 * carries a deliberately borderline tick and 73 questions make one flag worth
 * 1.4 percent. Every mutant then reads as "caught" by a gate that was already
 * red, and a suite with no power at all reports that it catches everything.
 */
export function survivorsOf(cases: readonly GoldenCase[]): string[] {
  const baseline = summarise(cases.map((item) => runCase(item)));
  const green = new Set(
    baseline.gates.filter((gate) => gate.armed && gate.passed).map((gate) => gate.gate),
  );

  const survivors: string[] = [];
  for (const mutant of MUTANTS) {
    const report = summarise(cases.map((item) => runCase(item, mutant.thresholds)));
    const caught = report.gates.some((gate) => gate.armed && !gate.passed && green.has(gate.gate));
    if (!caught) survivors.push(mutant.id);
  }
  return survivors;
}
