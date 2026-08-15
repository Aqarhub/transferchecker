// Places question rows and the timing marks that let the scanner recover a row
// index even when the print is slightly shifted.
//
// Questions are not uniform: each carries its own symbol set and decides
// whether its letters sit above the column, inside the bubbles or beside them.
// Every column is still given the width of the widest question on the sheet, so
// bubbles stay on one grid. A ragged grid would save a little paper and cost
// the scanner its simplest assumption, which is a bad trade.

import { GEOMETRY } from '../paper';
import type { Question, SheetSpec } from '../spec';
import type { ChoiceHeader, ChoiceLabel, QuestionColumn, QuestionRow, Rect } from '../types';

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
  // A header sits above the bubbles rather than beside them, so it costs
  // height rather than width and the row is as wide as an internal one.
  return GEOMETRY.numberGutterMm + 2 * radiusMm + (count - 1) * pitchXMm;
}

/** Width every column is given: the widest question decides for all of them. */
export function columnWidthMm(spec: SheetSpec): number {
  return Math.max(...spec.questions.map((question) => questionWidthMm(question, spec)));
}

const sameSymbols = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((symbol, index) => symbol === b[index]);

/**
 * Where each header row goes within a column: at the top, again every so many
 * rows, and wherever the symbols change so a header never describes a bubble it
 * does not belong to.
 */
function headerRows(questions: readonly Question[]): number[] {
  const rows: number[] = [];
  let sinceHeader = 0;

  for (const [index, question] of questions.entries()) {
    const previous = questions[index - 1];
    const changed = previous !== undefined && !sameSymbols(previous.symbols, question.symbols);
    const due = sinceHeader >= GEOMETRY.headerEveryRows;
    if (question.placement !== 'header') {
      sinceHeader = 0;
      continue;
    }
    if (index === 0 || changed || due) {
      rows.push(index);
      sinceHeader = 0;
    }
    sinceHeader += 1;
  }
  return rows;
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
      symbolsInBubbles: false,
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
    symbolsInBubbles: question.placement === 'internal',
  };
}

/**
 * The row pitch the grid actually prints at.
 *
 * `bubble.pitchYMm` is the closest rows may sit. When the questions do not fill
 * the height they were given, the rows spread to use it, because questions
 * crammed at the top of a half empty page read as a mistake. The spreading is
 * capped so a three question sheet does not end up a finger apart, and the
 * result is rounded down to a tenth of a millimetre, the unit everything else
 * on the sheet is measured in.
 */
function rowPitchMm(spec: SheetSpec, rows: number, headers: number, availableMm: number): number {
  const minimumMm = spec.bubble.pitchYMm;
  if (rows === 0) return minimumMm;
  const forRowsMm = availableMm - headers * GEOMETRY.choiceHeaderMm;
  const spreadMm = Math.floor((forRowsMm / rows) * 10) / 10;
  return Math.min(Math.max(minimumMm, spreadMm), GEOMETRY.maxRowPitchMm);
}

export function planGrid(
  spec: SheetSpec,
  leftMm: number,
  topMm: number,
  columnCount: number,
  availableHeightMm: number,
): GridPlan {
  const total = spec.questions.length;
  const rowsPerColumn = Math.ceil(total / columnCount);
  // Asking for more columns than the questions can fill would print blank ones.
  const usedColumns = Math.ceil(total / rowsPerColumn);
  const width = columnWidthMm(spec);

  // Headers are counted from the first column, which is the fullest, so every
  // column shares one row grid however its own headers fall.
  const firstColumn = spec.questions.slice(0, rowsPerColumn);
  const headerAt = new Set(headerRows(firstColumn));
  const pitchYMm = rowPitchMm(spec, rowsPerColumn, headerAt.size, availableHeightMm);

  /** Top of a row, counting the header rows that come before it. */
  const rowTopMm = (row: number): number => {
    let headersBefore = 0;
    for (const at of headerAt) if (at <= row) headersBefore += 1;
    return topMm + headersBefore * GEOMETRY.choiceHeaderMm + row * pitchYMm;
  };
  const centerYMm = (row: number): number => rowTopMm(row) + pitchYMm / 2;

  const columns = Array.from({ length: usedColumns }, (_, columnIndex): QuestionColumn => {
    const columnLeftMm = leftMm + columnIndex * (width + GEOMETRY.columnGapMm);
    const rows: QuestionRow[] = [];
    const headers: ChoiceHeader[] = [];

    for (let row = 0; row < rowsPerColumn; row += 1) {
      // Questions run down a column before moving to the next one.
      const index = columnIndex * rowsPerColumn + row;
      const question = spec.questions[index];
      if (question === undefined) break;

      if (headerAt.has(row) && question.placement === 'header') {
        const firstCxMm = columnLeftMm + GEOMETRY.numberGutterMm + spec.bubble.radiusMm;
        headers.push({
          firstRow: row,
          labels: question.symbols.map((symbol, symbolIndex): ChoiceLabel => ({
            anchor: {
              xMm: firstCxMm + symbolIndex * spec.bubble.pitchXMm,
              yMm: rowTopMm(row) - GEOMETRY.choiceHeaderMm / 2,
            },
            symbol,
          })),
        });
      }

      rows.push(rowAt(question, index + 1, columnLeftMm, centerYMm(row), spec));
    }

    return { index: columnIndex, headers, rows };
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
    heightMm: rowsPerColumn * pitchYMm + headerAt.size * GEOMETRY.choiceHeaderMm,
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
    const headers = headerRows(spec.questions.slice(0, rows)).length;
    const neededMm = rows * spec.bubble.pitchYMm + headers * GEOMETRY.choiceHeaderMm;
    if (neededMm <= availableHeightMm) return count;
  }
  // Nothing fits. Return the widest that fits horizontally so the caller can
  // report a height overflow against a real attempt.
  let best = 1;
  for (let count = 1; count <= maxColumns; count += 1) {
    if (fitsWidth(count)) best = count;
  }
  return best;
}
