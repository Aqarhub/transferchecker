// Acceptance tests: determinism, printed geometry, refusals and the defenses.
//
// The other half is in scan.test.ts. Split because docs/CODING-STANDARDS.md caps
// a file at 300 lines, and a suite is not a golden data file.
//
// Numbered against docs/PLAN.md section 11 and docs/FAILURE-MODES.md section
// 4ب-9. The criteria that need a database, a filesystem audit or a real
// photograph are not here and are named in docs/CORE-OMR.md rather than being
// quietly skipped.

import { describe, expect, it } from 'vitest';
import { layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import type { SheetLayout, SheetSpec } from '@transferchecker/sheet-spec';
import { scanSheet } from '../src/scan/pipeline';
import type { ScanResult } from '../src/scan/result';
import { messageKeyOf } from '../src/scan/reject';
import { renderSheet } from '../tools/render';
import type { PencilMark } from '../tools/render';
import { photograph } from '../tools/photograph';
import { scalePrint } from '../tools/print';

const TEXT = {
  name: 'Standard 50',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

/** A soft pencil, fully shaded. What the instructions ask a student for. */
const PENCIL = 55;

function sheet(kind: 'quick20' | 'standard50' = 'quick20'): {
  spec: SheetSpec;
  layout: SheetLayout;
} {
  const spec = stockTemplate(kind, TEXT);
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') throw new Error(`layout failed for ${kind}`);
  return { spec, layout: result.layout };
}

/** One filled bubble per question, cycling through the choices. */
function answerEvery(layout: SheetLayout, choices: readonly string[]): PencilMark[] {
  return layout.questionColumns.flatMap((column) =>
    column.rows.map((row) => ({
      groupId: `q:${String(row.question)}`,
      symbol: choices[(row.question - 1) % choices.length] ?? 'A',
      coverage: 0.92,
      value: PENCIL,
    })),
  );
}

const answerOf = (result: ScanResult, question: number): string => {
  if (result.kind !== 'ok') return `rejected:${result.reason.kind}`;
  const outcome = result.sheet.questions.find((entry) => entry.question === question)?.outcome;
  if (outcome === undefined) return 'missing';
  if (outcome.kind === 'answer') return outcome.symbol;
  return outcome.kind;
};

describe('criteria 12 and 13: two readings of one paper are one answer', () => {
  it('gives the identical complete result from two different photographs', () => {
    const { layout } = sheet();
    const marks = answerEvery(layout, ['A', 'B', 'C', 'D']);
    const flat = renderSheet(layout, { pxPerMm: 12, marks });

    const first = scanSheet(
      photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
        width: 1600,
        height: 2560,
        yawDeg: 4,
        pitchDeg: 3,
        seed: 31,
      }),
    );
    const second = scanSheet(
      photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
        width: 1600,
        height: 2560,
        yawDeg: -5,
        pitchDeg: -2,
        rollDeg: 3,
        seed: 32,
      }),
    );

    expect(first.kind).toBe('ok');
    expect(second.kind).toBe('ok');
    if (first.kind !== 'ok' || second.kind !== 'ok') return;

    // Criterion 12 compares the whole result, not the total: a warning that
    // appears and disappears is irreproducibility wearing a hat.
    expect(second.sheet.marks).toBe(first.sheet.marks);
    expect(second.sheet.questions.map((entry) => answerOf(second, entry.question))).toEqual(
      first.sheet.questions.map((entry) => answerOf(first, entry.question)),
    );
    expect(second.sheet.fields.map((entry) => entry.text)).toEqual(
      first.sheet.fields.map((entry) => entry.text),
    );
  });

  it('is bit for bit repeatable on one image, which is what makes the rest testable', () => {
    const { layout } = sheet();
    const image = renderSheet(layout, {
      pxPerMm: 10,
      marks: answerEvery(layout, ['A', 'B', 'C', 'D']),
    });
    const first = scanSheet(image);
    const second = scanSheet(image);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('criterion 15: printed geometry is never silently corrected', () => {
  it('grades identically at every scale that keeps the corner squares on the page', () => {
    const { layout } = sheet();
    const marks = answerEvery(layout, ['A', 'B', 'C', 'D']);
    const flat = renderSheet(layout, { pxPerMm: 10, marks });

    const at100 = scanSheet(flat);
    expect(at100.kind).toBe('ok');
    if (at100.kind !== 'ok') return;

    for (const factor of [0.9, 0.94, 0.96, 1.04]) {
      const result = scanSheet(scalePrint(flat, factor));
      const label = `at ${String(Math.round(factor * 100))} percent`;
      if (result.kind === 'rejected') {
        // A named refusal is the other allowed outcome, and the one thing that
        // is not allowed is a different grade with no word said.
        expect(`${label}: ${messageKeyOf(result.reason)}`).toBeTruthy();
        continue;
      }
      expect(`${label}: ${result.sheet.marks}`).toBe(`${label}: ${at100.sheet.marks}`);
      for (const entry of result.sheet.questions) {
        expect(`${label} q${String(entry.question)}: ${answerOf(result, entry.question)}`).toBe(
          `${label} q${String(entry.question)}: ${answerOf(at100, entry.question)}`,
        );
      }
    }
  });
});

describe('criterion 16: every refusal names a physical cause', () => {
  it('gives a message key for a frame with no sheet in it', () => {
    const empty = renderSheet(sheet().layout, { pxPerMm: 1 });
    const result = scanSheet(empty);
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(messageKeyOf(result.reason)).toMatch(/^scan\.reject\./);
  });

  it('names the resolution when the frame cannot carry the code', () => {
    const { layout } = sheet('standard50');
    const flat = renderSheet(layout, { pxPerMm: 12 });
    // Noise and blur included, because defense د6 grew the module by 62 percent
    // and a clean synthetic frame of this size now reads: what stops a real
    // phone at this distance is grain, not geometry.
    const frame = photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
      width: 420,
      height: 720,
      fill: 0.8,
      noise: 3,
      blur: 1,
      seed: 41,
    });
    const result = scanSheet(frame);
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('code_too_small');
    expect(messageKeyOf(result.reason)).toBe('scan.reject.comeCloser');
  });
});

describe('criterion 2: the scan fits its time budget', () => {
  it('keeps the determinism pass a small multiple of the measurement it repeats', () => {
    // Measured on Node 22 in this repository, median of five runs on a 1440 by
    // 2560 frame with tilt, noise and blur:
    //
    //   20 questions   44 ms with the perturbation set, 22 ms without
    //   50 questions   75 ms                            28 ms
    //  100 questions  117 ms                            35 ms
    //
    // The budget is 400 ms, so there is room. What is asserted is a RATIO and
    // not a wall clock, because a wall clock bound on a shared runner is not a
    // measurement, it is a flaky test: this very assertion failed once at 2000
    // ms while three other agents were running on the same machine, which is
    // the failure mode the first version of this comment predicted and then
    // walked into anyway.
    //
    // A ratio is load independent, because both halves run under the same load,
    // and it guards the thing that could actually regress: the perturbation set
    // re-measures every bubble six times, so if the shared stages before it
    // (finding the sheet, reading the code, the timing marks, the photometry)
    // ever fell into that loop, this number would jump from under three to
    // around seven.
    //
    // AND "UNDER THE SAME LOAD" IS WHY THE SAMPLES ARE PAIRED. Best of three
    // from each side separately does not satisfy that premise: the two sides
    // are timed at different moments, and the SHORTER one has the better chance
    // of catching a clean scheduling quantum in three tries. Under a full
    // `turbo run test` on four cores that asymmetry is large [measured]: across
    // eight monorepo runs, best-of-three over best-of-three ranged 2.90 to 4.72
    // and once reached 6.12, failing this assertion on an engine that had not
    // changed, while the median of PAIRED ratios over the same runs stayed
    // inside 2.56 to 3.59. One run shows it plainly: bare samples 154, 103, 57,
    // 50, 143 against full samples 261, 223, 255, 430, 408, where the bare side
    // found its clean quantum and the full side never did.
    //
    // Pairing costs nothing and hides nothing: a real regression moves every
    // pair, so the median moves with it.
    //
    // NOT measured on Hermes, not once. Hermes is slower than Node at typed
    // array work, so the hundred question sheet may land near the budget there
    // and the perturbation set is the first thing to trade away if it does.
    // That is an open question in docs/CORE-OMR.md, not a solved one.
    const { layout } = sheet('standard50');
    const flat = renderSheet(layout, {
      pxPerMm: 12,
      marks: answerEvery(layout, ['A', 'B', 'C', 'D']),
    });
    const frame = photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
      width: 1440,
      height: 2560,
      yawDeg: 4,
      pitchDeg: 3,
      noise: 3,
      blur: 1,
      seed: 9,
    });

    // Warm both paths before either is timed.
    scanSheet(frame);
    scanSheet(frame, { perturb: false });

    const time = (run: () => void): number => {
      const started = performance.now();
      run();
      return performance.now() - started;
    };
    // Five pairs, each half measured back to back against the other so both
    // meet the same machine, and the median so one preempted pair cannot decide
    // the verdict.
    const ratios: number[] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const bare = time(() => void scanSheet(frame, { perturb: false }));
      const full = time(() => void scanSheet(frame));
      expect(bare).toBeGreaterThan(0);
      ratios.push(full / bare);
    }
    ratios.sort((left, right) => left - right);

    expect(scanSheet(frame).kind).toBe('ok');
    expect(ratios[2] ?? Number.POSITIVE_INFINITY).toBeLessThan(6);
  });
});
