// Places question rows and the timing marks that let the scanner recover a row
// index even when the print is slightly shifted.
//
// Questions are no longer uniform: each carries its own symbol set and decides
// whether its letters sit inside or beside the bubbles. Every column is still
// given the width of the widest question on the sheet, so bubbles stay on one
// grid. A ragged grid would save a little paper and cost the scanner its
// simplest assumption, which is a bad trade.

import { GEOMETRY } from '../paper';
import type { Question, SheetSpec } from '../spec';
import type { ChoiceLabel, QuestionColumn, QuestionRow, Rect } from '../types';

export interface GridPlan {
  readonly columns: readonly QuestionColumn[];
  readonly timingMarks: readonly Rect[];
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Ink width of one question row, number gutter included. */
export function questionWidthMm(question: Question, spec: SheetSpec): number {
  const { radiusMm, pitchXMm } = spec.bubble;
  const count = question.symbols.length;
  if (question.placement === 'external') {
    const cellMm = GEOMETRY.externalLabelMm + 2 * radiusMm + GEOMETRY.externalGapMm;
    return GEOMETRY.numberGutterMm + count * cellMm;
  }
  return GEOMETRY.numberGutterMm + 2 * radiusMm + (count - 1) * pitchXMm;
}

/** Width every column is given: the widest question decides for all of them. */
export function columnWidthMm(spec: SheetSpec): number {
  return Math.max(...spec.questions.map((question) => questionWidthMm(question, spec)));
}

function rowAt(
  question: Question,
  number: number,
  leftMm: number,
  centerYMm: number,
  spec: SheetSpec,
): QuestionRow {
  const { radiusMm, pitchXMm } = spec.bubble;
  const numberAnchor = { xMm: leftMm + GEOMETRY.numberGutterMm - 2, yMm: centerYMm };

  if (question.placement === 'external') {
    const cellMm = GEOMETRY.externalLabelMm + 2 * radiusMm + GEOMETRY.externalGapMm;
    const cellLeftMm = (index: number): number => leftMm + GEOMETRY.numberGutterMm + index * cellMm;
    return {
      question: number,
      numberAnchor,
      bubbles: question.symbols.map((symbol, index) => ({
        cxMm: cellLeftMm(index) + GEOMETRY.externalLabelMm + radiusMm,
        cyMm: centerYMm,
        rMm: radiusMm,
        symbol,
      })),
      choiceLabels: question.symbols.map((symbol, index): ChoiceLabel => ({
        // Centre of the label slot rather than its left edge, so a two
        // character symbol grows away from the bubble on both sides instead of
        // running into it.
        anchor: { xMm: cellLeftMm(index) + GEOMETRY.externalLabelMm / 2, yMm: centerYMm },
        symbol,
      })),
    };
  }

  const firstCxMm = leftMm + GEOMETRY.numberGutterMm + radiusMm;
  return {
    question: number,
    numberAnchor,
    bubbles: question.symbols.map((symbol, index) => ({
      cxMm: firstCxMm + index * pitchXMm,
      cyMm: centerYMm,
      rMm: radiusMm,
      symbol,
    })),
    choiceLabels: [],
  };
}

export function planGrid(
  spec: SheetSpec,
  leftMm: number,
  topMm: number,
  columnCount: number,
): GridPlan {
  const { pitchYMm } = spec.bubble;
  const total = spec.questions.length;
  const rowsPerColumn = Math.ceil(total / columnCount);
  // Asking for more columns than the questions can fill would print blank ones.
  const usedColumns = Math.ceil(total / rowsPerColumn);
  const width = columnWidthMm(spec);
  const centerYMm = (row: number): number => topMm + row * pitchYMm + pitchYMm / 2;

  const columns = Array.from({ length: usedColumns }, (_, columnIndex): QuestionColumn => {
    const columnLeftMm = leftMm + columnIndex * (width + GEOMETRY.columnGapMm);
    const rows: QuestionRow[] = [];

    for (let row = 0; row < rowsPerColumn; row += 1) {
      // Questions run down a column before moving to the next one.
      const index = columnIndex * rowsPerColumn + row;
      const question = spec.questions[index];
      if (question === undefined) break;
      rows.push(rowAt(question, index + 1, columnLeftMm, centerYMm(row), spec));
    }

    return { index: columnIndex, rows };
  });

  const timingMarks = Array.from({ length: rowsPerColumn }, (_, row): Rect => ({
    xMm: GEOMETRY.marginMm,
    yMm: centerYMm(row) - GEOMETRY.timingHeightMm / 2,
    wMm: GEOMETRY.timingWidthMm,
    hMm: GEOMETRY.timingHeightMm,
  }));

  return {
    columns,
    timingMarks,
    widthMm: usedColumns * width + (usedColumns - 1) * GEOMETRY.columnGapMm,
    heightMm: rowsPerColumn * pitchYMm,
  };
}

/**
 * Picks the fewest columns that fit the questions in the space available.
 * Fewer columns read better, so the search stops at the first count that fits
 * rather than packing as tightly as possible.
 */
export function resolveColumns(
  spec: SheetSpec,
  availableWidthMm: number,
  availableHeightMm: number,
): number {
  const width = columnWidthMm(spec);
  const total = spec.questions.length;
  const fitsWidth = (count: number): boolean =>
    count * width + (count - 1) * GEOMETRY.columnGapMm <= availableWidthMm;

  if (spec.columns !== 'auto') return spec.columns;

  const maxColumns = Math.min(6, total);
  for (let count = 1; count <= maxColumns; count += 1) {
    if (!fitsWidth(count)) break;
    const rows = Math.ceil(total / count);
    if (rows * spec.bubble.pitchYMm <= availableHeightMm) return count;
  }
  // Nothing fits. Return the widest that fits horizontally so the caller can
  // report a height overflow against a real attempt.
  let best = 1;
  for (let count = 1; count <= maxColumns; count += 1) {
    if (fitsWidth(count)) best = count;
  }
  return best;
}
