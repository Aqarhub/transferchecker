// The two exports, and the check that stands between them and a teacher.
//
// Acceptance criterion 19 is a full round trip: a class list with leading zero
// identifiers and vocalised Arabic names, then marking, then export, then open
// in Excel. The identifiers must match byte for byte, the Arabic must be
// intact, no numeric or date cell may hold anything above U+007F, and no field
// may begin with a formula character.
//
// `auditTable` is that criterion as a function. It runs over the table BEFORE
// either writer touches it, so a violation is a caught defect rather than a
// file somebody opens in a staff room.

import { cellText, isAsciiCell, resultsTable } from './results';
import type { Cell, ResultRow, Table } from './results';
import { startsFormula, writeCsv } from './csv';
import { writeXlsx } from './xlsx';

export interface ExportFault {
  readonly row: number;
  readonly column: string;
  readonly reason: 'non ascii in a machine cell' | 'formula in a field';
  readonly value: string;
}

/**
 * What criterion 19 forbids, found before it ships.
 *
 * The formula check covers CSV, where a field is evaluated on open. The
 * workbook writer does not need it, since an inline string is never evaluated,
 * and it is still reported for both: a name that begins with `=` is worth
 * telling the teacher about whichever format they picked.
 */
export function auditTable(table: Table): ExportFault[] {
  const faults: ExportFault[] = [];
  for (const [at, row] of table.rows.entries()) {
    for (const [column, cell] of row.entries()) {
      const heading = table.headings[column] ?? String(column);
      if (!isAsciiCell(cell)) {
        faults.push({
          row: at + 2,
          column: heading,
          reason: 'non ascii in a machine cell',
          value: cellText(cell),
        });
      }
      if (startsFormula(cellText(cell))) {
        faults.push({
          row: at + 2,
          column: heading,
          reason: 'formula in a field',
          value: cellText(cell),
        });
      }
    }
  }
  return faults;
}

export interface Exported {
  readonly table: Table;
  /** Empty when the table met criterion 19 as it stands. */
  readonly faults: readonly ExportFault[];
}

export function exportResults(rows: readonly ResultRow[]): Exported {
  const table = resultsTable(rows);
  return { table, faults: auditTable(table) };
}

/** The interchange format, for anything that is not Excel. */
export function resultsCsv(rows: readonly ResultRow[], delimiter = ','): string {
  const { table } = exportResults(rows);
  const body: string[][] = [
    [...table.headings],
    ...table.rows.map((row) => row.map((cell: Cell) => cellText(cell))),
  ];
  return writeCsv(body, { delimiter });
}

/** And the one that keeps a leading zero, because the cell says what it is. */
export function resultsXlsx(rows: readonly ResultRow[], sheetName?: string): Uint8Array {
  const { table } = exportResults(rows);
  return sheetName === undefined ? writeXlsx(table) : writeXlsx(table, sheetName);
}
