// A workbook, which is the only export format that keeps `00713` as `00713`.
//
// CSV cannot do it. A spreadsheet reading a text file decides for itself what
// each field is, and every one of them decides that a run of digits is a number,
// so the leading zeros of a student identifier are gone before the teacher sees
// the file. The usual workaround is to write `="00713"`, and that is a formula,
// which acceptance criterion 19 forbids in the same sentence. The two halves of
// the criterion are only satisfiable together by a format where the cell says
// what it is, and that is this one.
//
// Written by hand and stored uncompressed, because the alternative is a
// dependency with a large surface for a file this small. Four XML parts and a
// zip, and `zip.ts` explains why no deflate.
//
// Inline strings rather than a shared string table: it costs a few bytes on a
// class of thirty and removes an entire indirection that could put the wrong
// name on the wrong row.
//
// A date is written as an ISO string and NOT as a date typed cell, which is a
// deliberate loss of a sortable type. A real date cell carries a serial number
// that the reader formats in its own locale, and an Arabic locale renders that
// with Arabic-Indic digits, which is the one thing criterion 19 forbids in a
// date cell. `2026-08-15` sorts correctly as text and reads the same
// everywhere, so the type is the thing given up rather than the meaning.

import { cellText } from './results';
import type { Cell, Table } from './results';
import { writeZip } from './zip';

/** XML escaping. The five, and nothing clever. */
function xml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** A1, B1, ... AA1. */
export function cellRef(column: number, row: number): string {
  let name = '';
  let at = column;
  while (at >= 0) {
    name = String.fromCharCode(65 + (at % 26)) + name;
    at = Math.floor(at / 26) - 1;
  }
  return `${name}${String(row)}`;
}

/**
 * One cell.
 *
 * A `text` cell is `t="inlineStr"`, which is a string and is never evaluated,
 * so a name of `=cmd|calc` is displayed and not run. That is why this path pays
 * nothing for the defusing that `csv.ts` pays an apostrophe for.
 */
function cellXml(cell: Cell, column: number, row: number): string {
  const ref = cellRef(column, row);
  if (cell.kind === 'number') {
    return `<c r="${ref}"><v>${xml(cellText(cell))}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(cellText(cell))}</t></is></c>`;
}

function sheetXml(table: Table): string {
  const rows: string[] = [];
  rows.push(
    `<row r="1">${table.headings.map((heading, at) => cellXml({ kind: 'text', value: heading }, at, 1)).join('')}</row>`,
  );
  for (const [at, row] of table.rows.entries()) {
    const number = at + 2;
    rows.push(
      `<row r="${String(number)}">${row.map((cell, column) => cellXml(cell, column, number)).join('')}</row>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const BOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

/** The workbook, as the bytes of an .xlsx file. */
export function writeXlsx(table: Table, sheetName = 'Results'): Uint8Array {
  // A sheet name may not carry these, and a teacher's exam title often does.
  const safe = sheetName.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Results';
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(safe)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  return writeZip([
    { path: '[Content_Types].xml', text: CONTENT_TYPES },
    { path: '_rels/.rels', text: ROOT_RELS },
    { path: 'xl/workbook.xml', text: workbook },
    { path: 'xl/_rels/workbook.xml.rels', text: BOOK_RELS },
    { path: 'xl/worksheets/sheet1.xml', text: sheetXml(table) },
  ]);
}
