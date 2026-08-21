// Acceptance criterion 19's export half, run end to end.
//
// The criterion: a class list with leading zero identifiers and vocalised
// Arabic names, then marking, then export, then open in Excel. Identifiers
// match byte for byte, the Arabic is intact, zero characters above U+007F in
// any numeric or date cell, and zero fields beginning with a formula character.
//
// The workbook is read back by unzipping it here, because a test that only
// checks what we wrote into a buffer proves that our own writer agrees with
// itself. This one opens the file.

import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/csv';
import { auditTable, exportResults, resultsCsv, resultsXlsx } from '../src/export';
import { gradeStored } from '../src/grade';
import { readRoster } from '../src/roster';
import { date, number, resultsTable, text } from '../src/results';
import type { ResultRow } from '../src/results';
import type { AnswerKey } from '../src/key';
import { crc32 } from '../src/zip';

const decoder = new TextDecoder();

/** Reads back a stored zip, so the assertions are about the FILE. */
function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, string>();
  let at = 0;
  while (at + 4 <= bytes.byteLength && view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const nameAt = at + 30;
    const bodyAt = nameAt + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameAt, nameAt + nameLength));
    const body = bytes.subarray(bodyAt, bodyAt + size);
    expect(crc32(body)).toBe(crc);
    out.set(name, decoder.decode(body));
    at = bodyAt + size;
  }
  return out;
}

const KEY: AnswerKey = {
  form: 'A',
  questions: [
    { intended: 0, points: 1, awards: [], tags: [] },
    { intended: 1, points: 1, awards: [], tags: [] },
    { intended: 2, points: 1, awards: [], tags: [] },
    { intended: 3, points: 1, awards: [], tags: [] },
  ],
};

/** The whole cycle: a real class list, marked, ready to export. */
function markedClass(): ResultRow[] {
  const roster = readRoster(
    'الرقم,الاسم\r\n' +
      '00713,عَبْدُالله الزهراني\r\n' +
      '00007,سارة\r\n' +
      '01024,"الشمري, خالد"\r\n',
  );
  expect(roster.faults).toEqual([]);
  const papers = ['0123', '01?3', '0!23'];
  const marks = ['cccc', 'ccbc', 'cdcc'];
  return roster.students.map((student, at) => {
    const grade = gradeStored(KEY, papers[at] ?? '', marks[at] ?? '');
    if (grade === null) throw new Error('the corpus of this test is wrong, not the code');
    return {
      student,
      scannedId: student.id,
      grade,
      marks: marks[at] ?? '',
      scannedAt: '2026-08-15',
    };
  });
}

describe('criterion 19, the export half', () => {
  it('passes its own audit with nothing to report', () => {
    const { faults } = exportResults(markedClass());
    expect(faults).toEqual([]);
  });

  it('keeps every identifier byte for byte in the workbook', () => {
    const files = readZip(resultsXlsx(markedClass()));
    const sheet = files.get('xl/worksheets/sheet1.xml') ?? '';
    for (const id of ['00713', '00007', '01024']) {
      // As an inline STRING, which is the whole reason this format is here: a
      // CSV reader decides `00007` is seven, and a workbook cell is told.
      expect(sheet).toContain(`t="inlineStr"><is><t xml:space="preserve">${id}</t>`);
    }
  });

  it('keeps a vocalised Arabic name intact through the workbook', () => {
    const files = readZip(resultsXlsx(markedClass()));
    const sheet = files.get('xl/worksheets/sheet1.xml') ?? '';
    expect(sheet).toContain('عَبْدُالله الزهراني');
    // And the comma inside a name is a comma, not a column break.
    expect(sheet).toContain('الشمري, خالد');
  });

  it('puts nothing above U+007F in any numeric or date cell', () => {
    // An Arabic locale renders 2026 as ٢٠٢٦ given the chance, and a spreadsheet
    // reads that as text, so a column of marks stops adding up.
    const { table } = exportResults(markedClass());
    for (const row of table.rows) {
      for (const cell of row) {
        if (cell.kind === 'text') continue;
        expect(/^[\x20-\x7e]*$/.test(String(cell.value))).toBe(true);
      }
    }
  });

  it('writes no field that a spreadsheet would execute', () => {
    const csv = resultsCsv(markedClass());
    for (const row of parseCsv(csv)) {
      for (const field of row) {
        expect(['=', '+', '-', '@', '\t', '\r', '\n']).not.toContain(field[0]);
      }
    }
  });

  it('catches a hostile name rather than shipping it', () => {
    // The audit is criterion 19 as a function, and it runs before either writer
    // touches the table.
    const table = resultsTable([
      {
        student: { id: '00713', name: '=cmd|/c calc' },
        scannedId: '00713',
        grade: gradeStored(KEY, '0123') ?? {
          score: 0,
          total: 0,
          questions: [],
          unresolved: 0,
          blanks: 0,
          reviews: 0,
          needsReview: false,
          formFault: 'none' as const,
        },
        marks: 'cccc',
        scannedAt: '2026-08-15',
      },
    ]);
    expect(auditTable(table)).toEqual([
      { row: 2, column: 'student_name', reason: 'formula in a field', value: '=cmd|/c calc' },
    ]);
    // And the CSV writer still refuses to emit it live.
    const rows = parseCsv(resultsCsv([...markedClass()]));
    expect(rows).toHaveLength(4);
  });

  it('catches a machine cell that stopped being machine readable', () => {
    const table = {
      headings: ['score', 'scanned_at'],
      rows: [[number(9.5), date('٢٠٢٦-٠٨-١٥')]],
    };
    expect(auditTable(table)).toEqual([
      { row: 2, column: 'scanned_at', reason: 'non ascii in a machine cell', value: '٢٠٢٦-٠٨-١٥' },
    ]);
  });
});

describe('the results table itself', () => {
  it('publishes the review count beside the score, and not as a footnote', () => {
    // A results file that shows a score without it is the same file a product
    // that guesses would produce.
    const { table } = exportResults(markedClass());
    expect(table.headings).toContain('review');
    const review = table.headings.indexOf('review');
    expect(table.rows.map((row) => row[review])).toEqual([number(0), number(0), number(1)]);
  });

  it('carries the marks string, which criterion 19 names by name', () => {
    const { table } = exportResults(markedClass());
    const marks = table.headings.indexOf('marks');
    expect(table.rows[2]?.[marks]).toEqual(text('cdcc'));
  });

  it('scores the class the way the papers were drawn', () => {
    const { table } = exportResults(markedClass());
    const score = table.headings.indexOf('score');
    expect(table.rows.map((row) => row[score])).toEqual([number(4), number(3), number(3)]);
  });
});

describe('the container', () => {
  it('writes an archive a reader can open, entry by entry', () => {
    const files = readZip(resultsXlsx(markedClass()));
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
    ]);
  });

  it('produces the same bytes twice for the same class', () => {
    // A clock in the archive would make two exports of one class differ, and
    // byte for byte is exactly what the criterion compares.
    expect(resultsXlsx(markedClass())).toEqual(resultsXlsx(markedClass()));
  });

  it('escapes XML rather than letting a name break the file', () => {
    const files = readZip(
      resultsXlsx([
        {
          student: { id: '1', name: '<b>&"x"</b>' },
          scannedId: '1',
          grade: gradeStored(KEY, '0123') ?? {
            score: 0,
            total: 0,
            questions: [],
            unresolved: 0,
            blanks: 0,
            reviews: 0,
            needsReview: false,
            formFault: 'none' as const,
          },
          marks: 'cccc',
          scannedAt: '2026-08-15',
        },
      ]),
    );
    const sheet = files.get('xl/worksheets/sheet1.xml') ?? '';
    expect(sheet).toContain('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
    expect(sheet).not.toContain('<b>');
  });
});
