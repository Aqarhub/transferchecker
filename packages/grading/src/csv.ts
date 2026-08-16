// CSV, read and written to RFC 4180, with the two things that rule does not
// cover and that decide whether a teacher's file survives.
//
// THE SEPARATOR IS NOT ALWAYS A COMMA. Excel writes and expects the list
// separator of the machine's locale, and on the Arabic and most European
// locales that is a semicolon. A reader that assumes a comma turns a class list
// into one column of thirty names, which looks like our bug and is the most
// likely first experience of this product.
//
// AND A FIELD THAT BEGINS WITH `=` IS A PROGRAM. Excel, LibreOffice and Sheets
// all evaluate it on open, so a student name typed as `=cmd|...` is a command
// that runs on the teacher's machine, and `@`, `+`, `-`, a tab and a carriage
// return start one too. Acceptance criterion 19 requires zero such fields in an
// export.
//
// The defusing costs a visible apostrophe in the cell, which is a real cost and
// the reason `xlsx.ts` exists beside this file: an inline string in a workbook
// is never evaluated, so that path pays nothing. This one is for interchange,
// where the receiving program is unknown and must be assumed hostile to us.

/** What a spreadsheet will evaluate rather than display. */
const FORMULA_LEAD = new Set(['=', '+', '-', '@', '\t', '\r', '\n']);

/** Byte order mark. Excel needs it to read a UTF-8 file as UTF-8 at all. */
export const BOM = '\ufeff';

export function startsFormula(field: string): boolean {
  const first = field[0];
  return first !== undefined && FORMULA_LEAD.has(first);
}

/**
 * The separator this text actually uses.
 *
 * Counted outside quotes on the header line only, because a quoted name may
 * legitimately contain either character and the header rarely does.
 */
export function detectDelimiter(text: string): string {
  const line = text.replace(/^\ufeff/, '').split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((candidate) => {
    let count = 0;
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === candidate && !quoted) count += 1;
    }
    return { candidate, count };
  });
  const best = counts.reduce((left, right) => (right.count > left.count ? right : left));
  return best.count === 0 ? ',' : best.candidate;
}

/**
 * Rows of fields, with quotes, embedded separators and embedded newlines held.
 *
 * Never throws and never drops a row: a file that is malformed halfway is still
 * a file a teacher needs to see thirty names from, and the caller decides what
 * an odd row means.
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const body = text.replace(/^\ufeff/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let at = 0;

  while (at < body.length) {
    const char = body[at] ?? '';
    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (body[at + 1] === '"') {
          field += '"';
          at += 2;
          continue;
        }
        quoted = false;
        at += 1;
        continue;
      }
      field += char;
      at += 1;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      at += 1;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
      at += 1;
    } else if (char === '\r' || char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      at += char === '\r' && body[at + 1] === '\n' ? 2 : 1;
    } else {
      field += char;
      at += 1;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A trailing newline is not an empty student.
  return rows.filter((entry) => entry.length > 1 || (entry[0] ?? '') !== '');
}

/** One field, quoted where it has to be and defused where it would execute. */
export function writeField(field: string, delimiter: string): string {
  // The apostrophe goes INSIDE the quotes, so the field is inert on open and
  // the original text is still one edit away rather than lost.
  const safe = startsFormula(field) ? `'${field}` : field;
  const mustQuote =
    safe.includes(delimiter) ||
    safe.includes('"') ||
    safe.includes('\n') ||
    safe.includes('\r') ||
    safe !== field;
  return mustQuote ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export interface CsvOptions {
  readonly delimiter?: string;
  /** Excel reads a UTF-8 file as the local code page without this. */
  readonly bom?: boolean;
}

export function writeCsv(rows: readonly (readonly string[])[], options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ',';
  const body = rows
    .map((row) => row.map((field) => writeField(field, delimiter)).join(delimiter))
    // CRLF, because RFC 4180 says so and because Excel on Windows is the reader
    // this file most often meets.
    .join('\r\n');
  return `${options.bom === false ? '' : BOM}${body}\r\n`;
}
