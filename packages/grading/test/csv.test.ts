// CSV, and the two things RFC 4180 does not cover.

import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, startsFormula, writeCsv, writeField } from '../src/csv';

describe('reading whatever the school exported', () => {
  it('finds the separator instead of assuming a comma', () => {
    // Excel writes the list separator of the machine's locale, and on Arabic
    // and most European locales that is a semicolon. Assuming a comma turns a
    // class list into one column of thirty names.
    expect(detectDelimiter('id;name\r\n001;سارة\r\n')).toBe(';');
    expect(detectDelimiter('id,name\r\n001,سارة\r\n')).toBe(',');
    expect(detectDelimiter('id\tname\r\n001\tسارة\r\n')).toBe('\t');
    // One column, no separator anywhere: a comma is as good a guess as any.
    expect(detectDelimiter('name\r\nسارة\r\n')).toBe(',');
  });

  it('does not count a separator that is inside a quoted heading', () => {
    expect(detectDelimiter('"last, first";id\r\n')).toBe(';');
  });

  it('eats the byte order mark Excel writes', () => {
    const rows = parseCsv('\ufeffid,name\r\n001,سارة\r\n');
    expect(rows[0]).toEqual(['id', 'name']);
  });

  it('holds a quoted field with a separator, a quote and a newline in it', () => {
    const rows = parseCsv(
      'id,name\r\n001,"الزهراني, سارة"\r\n002,"قال ""نعم"""\r\n003,"سطر\nثانٍ"\r\n',
    );
    expect(rows[1]).toEqual(['001', 'الزهراني, سارة']);
    expect(rows[2]).toEqual(['002', 'قال "نعم"']);
    expect(rows[3]).toEqual(['003', 'سطر\nثانٍ']);
  });

  it('does not invent a student out of a trailing newline', () => {
    expect(parseCsv('id,name\r\n001,سارة\r\n\r\n')).toHaveLength(2);
  });
});

describe('a field that begins with a formula character is a program', () => {
  it('knows every character a spreadsheet will execute', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r', '\n']) {
      expect(startsFormula(`${lead}cmd`)).toBe(true);
    }
    expect(startsFormula('سارة')).toBe(false);
    expect(startsFormula('00713')).toBe(false);
    expect(startsFormula('')).toBe(false);
  });

  it('defuses it, and says so by quoting rather than by dropping it', () => {
    // The apostrophe goes inside the quotes: inert on open, and the original
    // text is one edit away instead of lost.
    expect(writeField('=cmd|/c calc', ',')).toBe(`"'=cmd|/c calc"`);
    expect(writeField('@SUM(A1)', ',')).toBe(`"'@SUM(A1)"`);
    // And an ordinary field is untouched, so an id keeps its bytes.
    expect(writeField('00713', ',')).toBe('00713');
    expect(writeField('عَبْدُالله', ',')).toBe('عَبْدُالله');
  });

  it('quotes what has to be quoted and nothing else', () => {
    expect(writeField('a,b', ',')).toBe('"a,b"');
    expect(writeField('a,b', ';')).toBe('a,b');
    expect(writeField('say "hi"', ',')).toBe('"say ""hi"""');
  });
});

describe('writing a file Excel will actually open', () => {
  it('leads with the byte order mark and separates rows with CRLF', () => {
    const out = writeCsv([
      ['id', 'name'],
      ['001', 'سارة'],
    ]);
    expect(out.startsWith('\ufeff')).toBe(true);
    expect(out).toBe('\ufeffid,name\r\n001,سارة\r\n');
  });

  it('round trips everything it wrote', () => {
    const rows = [
      ['id', 'name'],
      ['00713', 'الزهراني, سارة'],
      ['00714', '=cmd|/c calc'],
      ['00715', 'قال "نعم"'],
    ];
    const back = parseCsv(writeCsv(rows));
    expect(back[1]).toEqual(rows[1]);
    expect(back[3]).toEqual(rows[3]);
    // The defused field comes back carrying its apostrophe, which is the cost
    // of the CSV path and the reason the workbook path exists.
    expect(back[2]).toEqual(['00714', "'=cmd|/c calc"]);
  });
});
