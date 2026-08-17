// Places question rows: side-by-side columns filled in whole groups, with the
// remainder in a shorter tail column.
//
// Version 5 packing, from the approved design. A column is filled to a whole
// number of groups (ten rows by default) before the next column starts, so
// every white break lands after a complete group and a fifty question sheet
// reads 20 + 20 + 10 rather than 17 + 17 + 16. The tail column is the shortest
// and always the last, and the space under it is where the identity grids go
// when they fit, which is what keeps the page fully used without a stretched
// sidebar.
//
// Questions are not uniform: each carries its own symbol set and decides
// whether its letters sit above the column, inside the bubbles or beside them.
// Every column is still given the width of the widest question on the sheet, so
// bubbles stay on one grid. A ragged grid would save a little paper and cost
// the scanner its simplest assumption, which is a bad trade.

import { GEOMETRY } from '../paper';
import type { Question, SheetSpec } from '../spec';
import type { ChoiceHeader, ChoiceLabel, QuestionColumn, QuestionRow } from '../types';

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

/** Rows per group, or 0 when the sheet prints one unbroken column. */
export function groupSizeOf(spec: SheetSpec): number {
  return spec.groupEvery === 'none' ? 0 : spec.groupEvery;
}

/** White breaks that come before `rows` rows: one per completed group. */
export function gapsBefore(rows: number, groupSize: number): number {
  if (groupSize <= 0 || rows <= 0) return 0;
  return Math.ceil(rows / groupSize) - 1;
}

/** Height of a column of `rows` rows at `pitchMm`, group gaps included. */
export function columnHeightMm(rows: number, pitchMm: number, groupSize: number): number {
  return rows * pitchMm + gapsBefore(rows, groupSize) * GEOMETRY.groupGapMm;
}

/** The most rows one column holds in `availableMm`, at the closest pitch. */
export function rowsThatFit(spec: SheetSpec, availableMm: number): number {
  const groupSize = groupSizeOf(spec);
  let rows = 0;
  while (rows < spec.questions.length) {
    const headers = headerCountFor(spec, rows + 1);
    const needed =
      columnHeightMm(rows + 1, spec.bubble.pitchYMm, groupSize) + headers * GEOMETRY.choiceHeaderMm;
    if (needed > availableMm) break;
    rows += 1;
  }
  return rows;
}

/** Choice-letter header rows the first column prints, given its row count. */
export function headerCountFor(spec: SheetSpec, rows: number): number {
  return headerRows(spec.questions.slice(0, rows)).length;
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

export interface ColumnPlan {
  /** Rows in every column but the last. */
  readonly rowsPerColumn: number;
  /** Rows in the last column: equal or shorter, never longer. */
  readonly tailRows: number;
  readonly columnCount: number;
}

/**
 * Splits the questions into columns filled by whole groups.
 *
 * The fewest columns whose rows fit the height wins, as in version 4, and the
 * per-column count is rounded UP to a whole number of groups when that still
 * fits, so the breaks land after complete groups and the remainder collects in
 * the tail. When rounding up would overflow the height, the plain ceiling
 * division stands and the last group of a column may run short, which the
 * owner accepted for the wide-identity layout.
 */
export function planColumns(
  spec: SheetSpec,
  rowsCap: number,
  fits: (plan: ColumnPlan) => boolean,
): ColumnPlan | null {
  const total = spec.questions.length;
  const groupSize = groupSizeOf(spec);
  if (rowsCap < 1) return null;

  const maxColumns = spec.columns === 'auto' ? Math.min(6, total) : spec.columns;
  const minColumns = spec.columns === 'auto' ? 1 : spec.columns;

  for (let columns = minColumns; columns <= maxColumns; columns += 1) {
    const plain = Math.ceil(total / columns);
    const grouped = groupSize > 0 ? Math.ceil(plain / groupSize) * groupSize : plain;
    for (const rows of grouped === plain ? [plain] : [grouped, plain]) {
      if (rows > rowsCap) continue;
      // Rounding up can leave a column with nothing: 20 questions over three
      // columns of ten fill two. Under 'auto' the empty column is dropped, not
      // printed; a FIXED count is the teacher's explicit request, so a rounding
      // that would change it is skipped in favour of the plain division.
      const used = Math.ceil(total / rows);
      if (spec.columns !== 'auto' && used !== columns) continue;
      const candidate: ColumnPlan = {
        rowsPerColumn: rows,
        tailRows: total - (used - 1) * rows,
        columnCount: used,
      };
      if (fits(candidate)) return candidate;
    }
  }
  return null;
}

export interface GridPlan {
  readonly columns: readonly QuestionColumn[];
  readonly widthMm: number;
  readonly heightMm: number;
  /** Height of the tail column alone, for placing the grids beneath it. */
  readonly tailHeightMm: number;
  readonly pitchYMm: number;
}

/** Lays the planned columns out at their final pitch. */
export function planGrid(
  spec: SheetSpec,
  plan: ColumnPlan,
  leftMm: number,
  topMm: number,
  pitchYMm: number,
): GridPlan {
  const width = columnWidthMm(spec);
  const groupSize = groupSizeOf(spec);
  const { rowsPerColumn, tailRows, columnCount } = plan;

  // Headers are counted from the first column, which is the fullest, so every
  // column shares one row grid however its own headers fall.
  const firstColumn = spec.questions.slice(0, rowsPerColumn);
  const headerAt = new Set(headerRows(firstColumn));

  /** Top of a row, counting group gaps and the header rows before it. */
  const rowTopMm = (row: number): number => {
    let headersBefore = 0;
    for (const at of headerAt) if (at <= row) headersBefore += 1;
    const gaps = groupSize > 0 ? Math.floor(row / groupSize) : 0;
    return (
      topMm + headersBefore * GEOMETRY.choiceHeaderMm + row * pitchYMm + gaps * GEOMETRY.groupGapMm
    );
  };
  const centerYMm = (row: number): number => rowTopMm(row) + pitchYMm / 2;

  const columns = Array.from({ length: columnCount }, (_, columnIndex): QuestionColumn => {
    const columnLeftMm = leftMm + columnIndex * (width + GEOMETRY.columnGapMm);
    const rowCount = columnIndex === columnCount - 1 ? tailRows : rowsPerColumn;
    const rows: QuestionRow[] = [];
    const headers: ChoiceHeader[] = [];

    for (let row = 0; row < rowCount; row += 1) {
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

  const headerHeightMm = headerAt.size * GEOMETRY.choiceHeaderMm;
  return {
    columns,
    widthMm: columnCount * width + (columnCount - 1) * GEOMETRY.columnGapMm,
    heightMm: columnHeightMm(rowsPerColumn, pitchYMm, groupSize) + headerHeightMm,
    tailHeightMm: columnHeightMm(tailRows, pitchYMm, groupSize) + headerHeightMm,
    pitchYMm,
  };
}
