// The identity grid, where two marks are never an answer.
//
// Defense د14 says a partly filled or doubtful identity grid must not become a
// number that looks real, because a mangled identity does not fail loudly: it
// looks like a DIFFERENT student, so it passes reconciliation and produces the
// duplicate record acceptance criterion 9 exists to prevent.
//
// The rule was claimed and not implemented. `measure-sheet.ts` passed
// `many: false`, which stops two marks becoming two digits, and left a heavy
// mark beside a faint one to become one confident digit. The real papers carry
// exactly that: an identity column with more than one mark in it.

import { describe, expect, it } from 'vitest';
import { bubbleGroups, layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import type { SheetLayout } from '@transferchecker/sheet-spec';
import { scanSheet } from '../src/scan/pipeline';
import type { ScanResult } from '../src/scan/result';
import { renderSheet } from '../tools/render';
import type { PencilMark } from '../tools/render';

const TEXT = {
  name: 'Quick 20',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

const PX = 12;
const PEN = 55;

function sheetOf(): SheetLayout {
  const result = layoutSheet(stockTemplate('quick20', TEXT));
  if (result.kind !== 'ok') throw new Error('layout failed');
  return result.layout;
}

/** The group id of one character column of the sheet's identity grid. */
function gridColumn(layout: SheetLayout, column: number): { id: string; symbols: string[] } {
  const groups = bubbleGroups(layout).filter((group) => group.id.startsWith('f:'));
  const ids = [...new Set(groups.map((group) => group.id.split(':').slice(0, 2).join(':')))];
  const first = ids[0];
  if (first === undefined) throw new Error('no grid field on this sheet');
  const id = `${first}:${String(column)}`;
  const group = groups.find((entry) => entry.id === id);
  if (group === undefined) throw new Error(`no grid column ${id}`);
  return { id, symbols: group.bubbles.map((bubble) => bubble.symbol) };
}

const graded = (result: ScanResult): ScanResult & { kind: 'ok' } => {
  if (result.kind !== 'ok') throw new Error(`refused: ${result.reason.kind}`);
  return result;
};

/**
 * One identity column carrying a heavy mark and a second one at `secondCoverage`,
 * and what the sheet says about the field afterwards.
 */
function readTwoMarks(secondCoverage: number) {
  const layout = sheetOf();
  const { id, symbols } = gridColumn(layout, 0);
  const heavy = symbols[3] ?? '3';
  const faint = symbols[8] ?? '8';
  const marks: PencilMark[] = [{ groupId: id, symbol: heavy, coverage: 0.92, value: PEN }];
  if (secondCoverage > 0) {
    marks.push({ groupId: id, symbol: faint, coverage: secondCoverage, value: PEN });
  }
  const sheet = graded(scanSheet(renderSheet(layout, { pxPerMm: PX, marks }))).sheet;
  const field = sheet.fields[0];
  if (field === undefined) throw new Error('no field read back');
  return { field, quality: sheet.quality, heavy };
}

describe('defense د14: two marks in one identity column are never one digit', () => {
  it('resolves a single mark, so the rule is not simply refusing everything', () => {
    const { field, heavy } = readTwoMarks(0);
    expect(field.columns[0]).toBe(heavy);
    expect(field.state).toBe('partial');
  });

  // The band that mattered. A second mark here clears the ink floor, so it is
  // really on the paper, but it sits far enough below the heavy one that the
  // runner up ratio was satisfied and the column came back as a clean digit.
  it('refuses the column when a second mark clears the floor, however faint', () => {
    for (const coverage of [0.45, 0.6, 0.75, 0.9]) {
      const { field } = readTwoMarks(coverage);
      expect([coverage, field.columns[0], field.state]).toEqual([coverage, null, 'ambiguous']);
    }
  });

  it('counts the refusal where somebody can see it', () => {
    const { quality } = readTwoMarks(0.75);
    // Every counter on the sheet used to be question only, so an ambiguous grid
    // column incremented nothing at all.
    expect(quality.fieldAmbiguous).toBe(1);
    // And it is NOT added to the question counters, whose published unit is the
    // question.
    expect(quality.ambiguous).toBe(0);
  });
});

describe('and a doubt the engine computed is not thrown away', () => {
  it('carries an uncertain flag beside the number', () => {
    // A trace under the floor does not stop the column resolving, and it should
    // not: it may be a smudge. What it may not do is disappear, leaving a clean
    // student id with no sign that anything was near it.
    const layout = sheetOf();
    const { id, symbols } = gridColumn(layout, 0);
    const marks: PencilMark[] = [
      { groupId: id, symbol: symbols[3] ?? '3', coverage: 0.92, value: PEN },
      // [measured] The trace band on this sheet is narrow: below about 0.35 of
      // coverage the mark is under `traceInk` and nothing is claimed about it,
      // and above about 0.45 it clears the ink floor and the column is refused
      // outright by the rule above. This sits inside it.
      { groupId: id, symbol: symbols[8] ?? '8', coverage: 0.4, value: 110 },
    ];
    const sheet = graded(scanSheet(renderSheet(layout, { pxPerMm: PX, marks }))).sheet;
    const field = sheet.fields[0];
    expect(field?.uncertain).toBe(true);
    expect(sheet.quality.fieldUncertain).toBe(1);
  });

  it('leaves a clean grid clean', () => {
    const { field, quality } = readTwoMarks(0);
    expect(field.uncertain).toBe(false);
    expect(quality.fieldUncertain).toBe(0);
    expect(quality.fieldAmbiguous).toBe(0);
  });
});
