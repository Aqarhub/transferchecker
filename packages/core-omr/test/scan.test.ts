// Grading a shaded sheet, and criterion 11: the blank comes back blank.
//
// The rest of the acceptance suite is in acceptance.test.ts.
//
// Every image is generated from the same layout object the PDF generator draws
// from, so nothing here can go stale against the sheet.

import { describe, expect, it } from 'vitest';
import { layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import type { SheetLayout, SheetSpec } from '@transferchecker/sheet-spec';
import { scanSheet } from '../src/scan/pipeline';
import type { ScanResult } from '../src/scan/result';
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

describe('a shaded sheet grades', () => {
  it('reads every answer on a flat render', () => {
    const { layout } = sheet();
    const choices = ['A', 'B', 'C', 'D'];
    const image = renderSheet(layout, { pxPerMm: 10, marks: answerEvery(layout, choices) });

    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.sheet.questions).toHaveLength(20);
    for (const entry of result.sheet.questions) {
      expect(`q${String(entry.question)}=${answerOf(result, entry.question)}`).toBe(
        `q${String(entry.question)}=${choices[(entry.question - 1) % choices.length] ?? 'A'}`,
      );
    }
    // Every question answered cleanly, so the record carries no warnings.
    expect(result.sheet.marks).toBe('c'.repeat(20));
    expect(result.sheet.quality.ambiguous).toBe(0);
    expect(result.sheet.quality.blanks).toBe(0);
  });

  it('reads through perspective, shadow, noise and blur', () => {
    const { layout } = sheet();
    const choices = ['A', 'B', 'C', 'D'];
    const flat = renderSheet(layout, { pxPerMm: 12, marks: answerEvery(layout, choices) });
    const frame = photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
      width: 1440,
      height: 2560,
      yawDeg: 6,
      pitchDeg: -5,
      rollDeg: 2,
      shadow: { fromMm: 0, toMm: layout.paper.heightMm, strength: 0.32 },
      noise: 3,
      blur: 1,
      seed: 21,
    });

    const result = scanSheet(frame);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    for (const entry of result.sheet.questions) {
      expect(`q${String(entry.question)}=${answerOf(result, entry.question)}`).toBe(
        `q${String(entry.question)}=${choices[(entry.question - 1) % choices.length] ?? 'A'}`,
      );
    }
  });
});

describe('criterion 11: the blank comes back blank', () => {
  it('returns blank for a clean question and never invents a letter', () => {
    const { layout } = sheet();
    // Every question answered except three, which the student left untouched.
    const skipped = new Set([4, 11, 17]);
    const marks = answerEvery(layout, ['A', 'B', 'C', 'D']).filter(
      (mark) => !skipped.has(Number(mark.groupId.slice(2))),
    );
    const image = renderSheet(layout, { pxPerMm: 10, marks });

    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    for (const question of skipped) expect(answerOf(result, question)).toBe('blank');
    expect(result.sheet.quality.blanks).toBe(skipped.size);
  });

  it('returns blank for a question carrying dust, at three levels of it', () => {
    // This is the first proven defect, run as a test. Under the plan's rule the
    // speck is the brightest thing in the row, normalises to 1.00 and comes back
    // as a confident letter on a question the student never touched.
    const { layout } = sheet();
    for (const [level, speck] of [
      [3, { coverage: 0.16, value: 150 }],
      [5, { coverage: 0.2, value: 120 }],
      [10, { coverage: 0.26, value: 90 }],
    ] as const) {
      const image = renderSheet(layout, {
        pxPerMm: 10,
        marks: [
          { groupId: 'q:7', symbol: 'C', coverage: speck.coverage, value: speck.value },
          { groupId: 'q:8', symbol: 'A', coverage: 0.92, value: PENCIL },
        ],
      });
      const result = scanSheet(image);
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') continue;
      expect(`dust x${String(level)}: ${answerOf(result, 7)}`).toBe(
        `dust x${String(level)}: blank`,
      );
      // And the ordinary answer beside it is untouched by the strictness.
      expect(answerOf(result, 8)).toBe('A');
    }
  });

  it('returns the letter for one light mark that clears the floor', () => {
    const { layout } = sheet();
    // A hard pencil, shaded through: light, but a real answer.
    const image = renderSheet(layout, {
      pxPerMm: 10,
      marks: [{ groupId: 'q:5', symbol: 'D', coverage: 0.9, value: 150 }],
    });
    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(answerOf(result, 5)).toBe('D');
  });

  it('calls a question ambiguous when every bubble is marked, not the darkest', () => {
    const { layout } = sheet();
    const marks: PencilMark[] = ['A', 'B', 'C', 'D'].map((symbol, index) => ({
      groupId: 'q:9',
      symbol,
      coverage: 0.9,
      value: 60 + index * 12,
    }));
    const image = renderSheet(layout, { pxPerMm: 10, marks });
    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(answerOf(result, 9)).toBe('ambiguous');
  });
});
