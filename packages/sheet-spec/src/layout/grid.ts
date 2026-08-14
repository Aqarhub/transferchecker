// Places the question bubbles and the timing marks that let the scanner
// recover a row index even when the print is slightly shifted.

import { choiceSymbols } from '../alphabet';
import { GEOMETRY } from '../paper';
import type { SheetSpec } from '../spec';
import type { QuestionColumn, QuestionRow, Rect } from '../types';

export interface GridPlan {
  readonly columns: readonly QuestionColumn[];
  readonly timingMarks: readonly Rect[];
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Ink width of a single question column, number gutter included. */
export function columnWidthMm(spec: SheetSpec): number {
  const { radiusMm, pitchXMm } = spec.bubble;
  return GEOMETRY.numberGutterMm + 2 * radiusMm + (spec.choices - 1) * pitchXMm;
}

export function planGrid(spec: SheetSpec, leftMm: number, topMm: number): GridPlan {
  const symbols = choiceSymbols(spec.choiceLabels, spec.choices);
  const { radiusMm, pitchXMm, pitchYMm } = spec.bubble;

  const rowsPerColumn = Math.ceil(spec.questions / spec.columns);
  // Requesting more columns than the questions can fill would print blank
  // columns, so the trailing empty ones are dropped.
  const usedColumns = Math.ceil(spec.questions / rowsPerColumn);
  const columnWidth = columnWidthMm(spec);
  const rowCenterMm = (row: number): number => topMm + row * pitchYMm + pitchYMm / 2;

  const columns = Array.from({ length: usedColumns }, (_, columnIndex): QuestionColumn => {
    const columnLeftMm = leftMm + columnIndex * (columnWidth + GEOMETRY.columnGapMm);
    const firstBubbleCxMm = columnLeftMm + GEOMETRY.numberGutterMm + radiusMm;
    const rows: QuestionRow[] = [];

    for (let row = 0; row < rowsPerColumn; row += 1) {
      // Questions run down a column before moving to the next one.
      const question = columnIndex * rowsPerColumn + row + 1;
      if (question > spec.questions) break;
      const centerYMm = rowCenterMm(row);
      rows.push({
        question,
        numberAnchor: { xMm: columnLeftMm + GEOMETRY.numberGutterMm - 2, yMm: centerYMm },
        bubbles: symbols.map((symbol, choice) => ({
          cxMm: firstBubbleCxMm + choice * pitchXMm,
          cyMm: centerYMm,
          rMm: radiusMm,
          symbol,
        })),
      });
    }

    return { index: columnIndex, rows };
  });

  const timingMarks = Array.from({ length: rowsPerColumn }, (_, row): Rect => ({
    xMm: GEOMETRY.marginMm,
    yMm: rowCenterMm(row) - GEOMETRY.timingHeightMm / 2,
    wMm: GEOMETRY.timingWidthMm,
    hMm: GEOMETRY.timingHeightMm,
  }));

  return {
    columns,
    timingMarks,
    widthMm: usedColumns * columnWidth + (usedColumns - 1) * GEOMETRY.columnGapMm,
    heightMm: rowsPerColumn * pitchYMm,
  };
}
