// The golden sweep, as a build gate.
//
// This file runs the subset that fits a test command: flat pages, the two
// smaller templates, and every case that needs no camera. [measured] 19 cases,
// 660 questions, 11.5 seconds. The full sweep is 51 cases and 33 seconds and is
// a command a person runs, `pnpm --filter @transferchecker/core-omr golden`,
// because a suite that takes half a minute stops being run.
//
// What it can prove is written into the report itself and repeated here so that
// nobody has to go looking: these are pages drawn from the same layout object
// the engine reads, so this measures whether the named defenses still work and
// whether a change moved a number. **It is not the accuracy claim.** No toner,
// no graphite, no camera and no paper are involved, and the gates that carry
// the published number stay disarmed until real papers exist.

import { describe, expect, it } from 'vitest';
import { allCases, quickCases } from '../tools/golden/cases';
import { MUTANTS, survivorsOf } from '../tools/golden/mutants';
import { forgetRenders } from '../tools/golden/image';
import { summarise } from '../tools/golden/report';
import { runCase } from '../tools/golden/score';
import type { CaseRecord } from '../tools/golden/score';
import { expectedOf, verdictOf } from '../tools/golden/truth';

const BUDGET_MS = 60_000;

let records: CaseRecord[] = [];

function sweep(): CaseRecord[] {
  if (records.length === 0) {
    records = quickCases().map((item) => runCase(item));
    forgetRenders();
  }
  return records;
}

describe('the golden sweep', () => {
  it('never gives a confident answer the paper does not carry', { timeout: BUDGET_MS }, () => {
    const report = summarise(sweep());
    const offenders = sweep()
      .filter((record) => record.counts.wrong > 0)
      .map((record) => {
        const wrong = record.questions.filter((question) => question.verdict === 'wrong');
        return `${record.id}: ${wrong.map((q) => `q${String(q.question)} wanted ${q.expected.kind} got ${q.outcome}`).join('; ')}`;
      });

    // The hard zero. Everything else in this file is a rate; this one is a
    // count, because one confident wrong letter is a wrong grade that went home
    // in a schoolbag.
    expect(offenders.join('\n')).toBe('');
    expect(report.counts.wrong).toBe(0);
  });

  it('ends every case the way the case was designed to end', { timeout: BUDGET_MS }, () => {
    const wrongEnding = sweep()
      .filter((record) => !record.asked)
      .map((record) => `${record.id}: wanted ${record.wanted}, got ${record.got}`);
    expect(wrongEnding.join('\n')).toBe('');
  });

  it(
    'keeps the decision margin off the threshold it would have to cross',
    { timeout: BUDGET_MS },
    () => {
      // The leading indicator. Accuracy is a lagging one: it only moves once a
      // margin has already collapsed, and by then the change that did it is
      // several commits back.
      const report = summarise(sweep());
      expect(report.marginP1).toBeGreaterThan(0.05);
    },
  );

  it('reports what it measured, and says what it did not', { timeout: BUDGET_MS }, () => {
    const report = summarise(sweep());
    expect(report.tier).toBe('synthetic');
    expect(report.caveat).toContain('NOT measure accuracy on paper');
    // The two gates that carry the published number are disarmed until real
    // papers exist, and a green build may never be read as that claim.
    const armed = report.gates.filter((gate) => gate.armed).map((gate) => gate.gate);
    expect(armed).not.toContain('accuracy at or above 99.7 percent');
    expect(armed).not.toContain('per stratum floor of 98 percent');
  });
});

describe('the truth of a case comes from the paper, not from the engine', () => {
  it('reads one shaded bubble as one answer however many strokes drew it', () => {
    // The first run of this sweep failed here, and the corpus was wrong rather
    // than the engine: two strokes aimed at the same bubble were counted as two
    // answers, so a correctly graded question was reported as a silent error.
    const twice = expectedOf([
      { groupId: 'q:1', symbol: 'C', coverage: 0.92, value: 55 },
      { groupId: 'q:1', symbol: 'C', coverage: 0.9, value: 120 },
    ]);
    expect(twice).toEqual({ kind: 'answer', symbol: 'C' });

    const two = expectedOf([
      { groupId: 'q:1', symbol: 'B', coverage: 0.9, value: 55 },
      { groupId: 'q:1', symbol: 'D', coverage: 0.88, value: 55 },
    ]);
    expect(two.kind).toBe('flagged');
  });

  it('never lets an erased mark be the answer', () => {
    const expected = expectedOf([
      { groupId: 'q:1', symbol: 'A', coverage: 0.8, value: 185, erased: true },
      { groupId: 'q:1', symbol: 'C', coverage: 0.9, value: 55 },
    ]);
    expect(expected).toEqual({ kind: 'either', symbol: 'C', why: 'an erased or faint neighbour' });
    // The ghost's letter is wrong even when the engine is confident about it.
    expect(
      verdictOf(expected, {
        kind: 'answer',
        index: 0,
        symbol: 'A',
        margin: 0.4,
        uncertain: false,
        escaped: false,
        trace: false,
      }),
    ).toBe('wrong');
    expect(
      verdictOf(expected, {
        kind: 'answer',
        index: 2,
        symbol: 'C',
        margin: 0.4,
        uncertain: false,
        escaped: false,
        trace: false,
      }),
    ).toBe('correct');
  });

  it('counts a doubt and a mistake in different buckets', () => {
    const answer = expectedOf([{ groupId: 'q:1', symbol: 'B', coverage: 0.9, value: 55 }]);
    expect(verdictOf(answer, { kind: 'blank', margin: 0.2, trace: false })).toBe('missed');
    expect(verdictOf(answer, { kind: 'ambiguous', reason: 'two_close', margin: 0.02 })).toBe(
      'flagged',
    );
    expect(
      verdictOf(answer, {
        kind: 'answer',
        index: 1,
        symbol: 'B',
        margin: 0.02,
        uncertain: true,
        escaped: false,
        trace: false,
      }),
    ).toBe('flagged');
    expect(
      verdictOf(answer, {
        kind: 'answer',
        index: 2,
        symbol: 'C',
        margin: 0.4,
        uncertain: false,
        escaped: false,
        trace: false,
      }),
    ).toBe('wrong');
  });

  it('treats an untouched question as blank, where a letter is the worst outcome', () => {
    const blank = expectedOf([]);
    expect(blank).toEqual({ kind: 'blank' });
    expect(verdictOf(blank, { kind: 'blank', margin: 0.3, trace: false })).toBe('correct');
    expect(
      verdictOf(blank, {
        kind: 'answer',
        index: 0,
        symbol: 'A',
        margin: 0.3,
        uncertain: false,
        escaped: false,
        trace: false,
      }),
    ).toBe('wrong');
  });
});

describe('the sweep is asked whether it could fail at all', () => {
  /**
   * The four cases that exercise a decision rather than a pipeline stage, which
   * is what a mutation needs to show up in. [measured] 19.2 seconds for the
   * whole catalogue against them.
   */
  const PROBES = new Set([
    'clean/quick20/answered-100',
    'marks/a-real-hand-flat',
    'printing/toner-40',
    'printing/speck-on-weak-toner',
    'lighting/glare-on-a-shaded-bubble',
  ]);

  /**
   * The mutants this suite still cannot see, each with the reason it survives.
   * A ratchet rather than a blocker: green today, and red the moment a new
   * mutant survives or a listed one starts being caught without this list being
   * updated. Progress is this list getting shorter in a reviewable diff.
   *
   * [measured] It was NINE of twelve before the marks alphabet became a gate
   * and the margin stopped being taken over blanks, and twelve of fourteen when
   * the sweep was first written: an engine with `minInk` at 0.99 that read
   * nothing at all passed every gate with the BEST margin score in the corpus.
   *
   * A mutant counts as caught only when it fails a gate the unmutated engine
   * passes, which is not pedantry: without that clause this list read "none"
   * because the probe set's own baseline sits under the answered accuracy
   * ratchet, and a suite with no power reported that it caught everything.
   */
  const SURVIVORS = [
    // The corpus has no mark between 0.25 and 0.45 ink, so nothing distinguishes
    // the two floors. Closing it needs a mark strength ladder.
    'raised-floor',
    // No case demands an UNCERTAIN answer, only doubtful ones that resolve to
    // ambiguous or blank.
    'flag-nothing',
    // The double mark on q11 is two nearly equal shadings, so 0.95 of the top
    // is still under the runner up and the outcome does not change. A strong
    // plus medium pair would catch it.
    'runner-up-blind',
    // Neutralised rather than missed: since the trace flag gained the same
    // absolute companion the answer floor has, lowering `traceInk` alone no
    // longer changes what is flagged on a healthy sheet.
    'trace-paranoid',
  ];

  it('catches the mutants it claims to, and no more', { timeout: 120_000 }, () => {
    const probes = allCases().filter((item) => PROBES.has(item.id));
    expect(probes.length).toBe(PROBES.size);

    const survivors = survivorsOf(probes);
    expect(survivors.join('\n')).toBe(SURVIVORS.join('\n'));
    // And the catalogue is worth something only if most of it is caught.
    expect(MUTANTS.length - survivors.length).toBeGreaterThanOrEqual(8);
  });
});
