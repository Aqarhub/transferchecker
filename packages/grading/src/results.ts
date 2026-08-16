// The results table, typed by cell, which is what acceptance criterion 19 gates.
//
// The criterion asks for two things that pull against each other, and the cell
// type is how they are held apart. Identifiers and names must survive BYTE FOR
// BYTE, Arabic diacritics included. Numbers and dates must contain nothing above
// U+007F at all, because an Arabic locale will happily render 2026 as ٢٠٢٦ and a
// spreadsheet reads that as text, so a column of marks silently stops being a
// column of marks and no total ever adds up again.
//
// So a cell declares which it is, and the exporters do not guess. `text` is
// carried through untouched; `number` and `date` are formatted here, in ASCII,
// once, and every exporter reuses that instead of formatting its own.

import type { Grade } from './grade';
import type { Student } from './roster';

export type Cell =
  /** Carried exactly as given. The one place Arabic and leading zeros live. */
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  /** ISO 8601, which is the only date format no locale reinterprets. */
  | { readonly kind: 'date'; readonly value: string };

export const text = (value: string): Cell => ({ kind: 'text', value });
export const number = (value: number): Cell => ({ kind: 'number', value });
export const date = (value: string): Cell => ({ kind: 'date', value });

export interface Table {
  readonly headings: readonly string[];
  readonly rows: readonly (readonly Cell[])[];
}

/**
 * A cell as the characters that go on disk.
 *
 * Western digits and a dot, always, for anything numeric. `toLocaleString` is
 * the function that would quietly break this, so it is never called.
 */
export function cellText(cell: Cell): string {
  switch (cell.kind) {
    case 'text':
      return cell.value;
    case 'date':
      return cell.value;
    case 'number':
      // Trailing zeros dropped, because a mark of 9.50 reads as an accuracy
      // nobody claimed. `Number.prototype.toString` is locale independent.
      return Number.isFinite(cell.value) ? String(cell.value) : '';
  }
}

/** Whether a cell that must be machine readable has stopped being so. */
export function isAsciiCell(cell: Cell): boolean {
  if (cell.kind === 'text') return true;
  return /^[\x20-\x7e]*$/.test(cellText(cell));
}

export interface ResultRow {
  readonly student: Student | null;
  /** The identifier the sheet's own grid carried, or null for an unread grid. */
  readonly scannedId: string | null;
  readonly grade: Grade;
  /** Defense د20's one character per question, as stored. */
  readonly marks: string;
  /** ISO date the paper was scanned. */
  readonly scannedAt: string;
}

export const RESULT_HEADINGS = [
  'student_id',
  'student_name',
  'score',
  'total',
  'percent',
  'blanks',
  'review',
  'marks',
  'scanned_at',
] as const;

/**
 * The teacher's table.
 *
 * `review` is a column and not a footnote: it is the count acceptance criterion
 * 14 caps, and a results file that shows a score without it is the same file a
 * product that guesses would produce.
 */
export function resultsTable(rows: readonly ResultRow[]): Table {
  return {
    headings: [...RESULT_HEADINGS],
    rows: rows.map((row) => [
      // The scanned identifier wins over the roster's, because it is what the
      // student actually shaded and the roster is only how we name them.
      text(row.scannedId ?? row.student?.id ?? ''),
      text(row.student?.name ?? ''),
      number(row.grade.score),
      number(row.grade.total),
      number(
        row.grade.total === 0 ? 0 : Math.round((row.grade.score / row.grade.total) * 1000) / 10,
      ),
      number(row.grade.blanks),
      number(row.grade.reviews),
      text(row.marks),
      date(row.scannedAt),
    ]),
  };
}
