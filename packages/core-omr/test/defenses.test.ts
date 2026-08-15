// The named defenses of docs/FAILURE-MODES.md that live in this package.
//
// The acceptance criteria are in scan.test.ts and acceptance.test.ts. Split
// because docs/CODING-STANDARDS.md caps a file at 300 lines.
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

describe('defense د14: an identity grid is never resolved into a plausible number', () => {
  it('reports a partly filled grid as partial, with the blank columns shown', () => {
    const { layout } = sheet();
    const grid = layout.gridFields.find((field) => field.id === 'studentId');
    expect(grid).toBeDefined();
    if (grid === undefined) return;

    // Three of the four digits filled, which is the ordinary way a student
    // half fills an identity grid.
    const marks: PencilMark[] = [0, 1, 3].map((column, index) => ({
      groupId: `f:studentId:${String(column)}`,
      symbol: ['3', '7', '4'][index] ?? '0',
      coverage: 0.9,
      value: PENCIL,
    }));
    const image = renderSheet(layout, { pxPerMm: 10, marks });

    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const field = result.sheet.fields.find((entry) => entry.usage === 'studentId');
    expect(field?.state).toBe('partial');
    expect(field?.text).toBe('37_4');
  });

  it('reports an untouched grid as unset rather than as zero', () => {
    const { layout } = sheet();
    const image = renderSheet(layout, { pxPerMm: 10 });
    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const field = result.sheet.fields.find((entry) => entry.usage === 'studentId');
    expect(field?.state).toBe('unset');
    expect(field?.text).toBe('____');
  });
});

describe('criterion 10: no silent wrong answer under glare', () => {
  it('refuses the frame rather than reading a blinded bubble as blank', () => {
    const { layout } = sheet();
    const marks = answerEvery(layout, ['A', 'B', 'C', 'D']);
    const flat = renderSheet(layout, { pxPerMm: 12, marks });

    // The highlight is placed inside a shaded bubble, which is where it really
    // lands: graphite is partly mirrored, so under a point source the brightest
    // spot on the page ends up in the darkest place on it.
    const target = layout.questionColumns[0]?.rows[5]?.bubbles[1];
    expect(target).toBeDefined();
    if (target === undefined) return;

    const frame = photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
      width: 1600,
      height: 2560,
      glare: { xMm: target.cxMm, yMm: target.cyMm, rMm: 6, strength: 0.95 },
      seed: 51,
    });

    const result = scanSheet(frame);
    // The only two honest outcomes: a named refusal of the whole frame, or the
    // right letter. A wrong letter or a blank would be the silent wrong grade.
    if (result.kind === 'rejected') {
      expect(result.reason.kind).toBe('glare');
      if (result.reason.kind === 'glare') expect(result.reason.groups).toBeGreaterThan(0);
      return;
    }
    expect(answerOf(result, 6)).toBe('B');
  });
});

describe('criterion 13: the answer survives the disturbance a hand really makes', () => {
  it('is unchanged under tilt, scale, shift and exposure', () => {
    const { layout } = sheet();
    const marks = answerEvery(layout, ['A', 'B', 'C', 'D']);
    const flat = renderSheet(layout, { pxPerMm: 12, marks });

    const base = {
      width: 1600,
      height: 2560,
      yawDeg: 3,
      pitchDeg: 2,
      seed: 61,
    } as const;
    const reference = scanSheet(
      photograph(flat, layout.paper.widthMm, layout.paper.heightMm, base),
    );
    expect(reference.kind).toBe('ok');
    if (reference.kind !== 'ok') return;

    // The numbers defense د13 names, applied where they belong: to the
    // photograph, not to the sampling frame. A tilt of 1.5 degrees is absorbed
    // exactly by the four corner squares, which is the point of having them.
    const disturbances = [
      { rollDeg: 1.5 },
      { rollDeg: -1.5 },
      { fill: 0.86 * 1.02 },
      { fill: 0.86 * 0.98 },
      { exposure: 1.1 },
      { exposure: 0.9 },
    ];

    for (const [index, disturbance] of disturbances.entries()) {
      const result = scanSheet(
        photograph(flat, layout.paper.widthMm, layout.paper.heightMm, { ...base, ...disturbance }),
      );
      const label = `disturbance ${String(index)}`;
      expect(`${label}: ${result.kind}`).toBe(`${label}: ok`);
      if (result.kind !== 'ok') continue;
      expect(`${label}: ${result.sheet.marks}`).toBe(`${label}: ${reference.sheet.marks}`);
      expect(result.sheet.questions.map((entry) => answerOf(result, entry.question))).toEqual(
        reference.sheet.questions.map((entry) => answerOf(reference, entry.question)),
      );
    }
  });
});

describe('defense د9: ink that left its bubble is flagged, not averaged away', () => {
  it('flags an answer whose mark spills outside the bubble', () => {
    const { layout } = sheet();
    const image = renderSheet(layout, {
      pxPerMm: 10,
      marks: [
        // A shading that overruns its bubble, which is what a circled letter or
        // a strike through leaves behind.
        { groupId: 'q:3', symbol: 'B', coverage: 1.35, value: PENCIL },
        { groupId: 'q:4', symbol: 'B', coverage: 0.9, value: PENCIL },
      ],
    });
    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const spilled = result.sheet.questions.find((entry) => entry.question === 3)?.outcome;
    const clean = result.sheet.questions.find((entry) => entry.question === 4)?.outcome;
    expect(spilled?.kind).toBe('answer');
    expect(clean?.kind).toBe('answer');
    if (spilled?.kind !== 'answer' || clean?.kind !== 'answer') return;

    // The letter is still read. What changes is that the sheet says so.
    expect(spilled.symbol).toBe('B');
    expect(spilled.escaped).toBe(true);
    expect(clean.escaped).toBe(false);
    expect(result.sheet.marks[2]).toBe('e');
  });
});

describe('defense د12: a timing mark that cannot be read stops the sheet', () => {
  it('refuses by name rather than renumbering every row below it', () => {
    const { layout } = sheet();
    const flat = renderSheet(layout, {
      pxPerMm: 10,
      marks: answerEvery(layout, ['A', 'B', 'C', 'D']),
    });

    // A pen stroke over one mark, drawn as paper: the mark is simply gone. This
    // is the failure that does not damage a grade, it invents a whole paper.
    const covered = layout.timingMarks[6];
    expect(covered).toBeDefined();
    if (covered === undefined) return;
    for (
      let y = Math.round((covered.yMm - 1) * 10);
      y <= Math.round((covered.yMm + covered.hMm + 1) * 10);
      y += 1
    ) {
      for (
        let x = Math.round((covered.xMm - 1) * 10);
        x <= Math.round((covered.xMm + covered.wMm + 1) * 10);
        x += 1
      ) {
        if (x < 0 || y < 0 || x >= flat.width || y >= flat.height) continue;
        flat.data[y * flat.stride + x] = 216;
      }
    }

    const result = scanSheet(flat);
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('rows_missing');
    if (result.reason.kind !== 'rows_missing') return;
    expect(result.reason.found).toBe(result.reason.expected - 1);
    expect(messageKeyOf(result.reason)).toBe('scan.reject.rowsMissing');
  });
});
