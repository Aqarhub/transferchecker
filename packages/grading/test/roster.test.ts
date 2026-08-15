// The class list, which is the barrier to entry PLAN.md section 0 names.

import { describe, expect, it } from 'vitest';
import { readRoster } from '../src/roster';

describe('importing a class', () => {
  it('reads a plain file with headings in either language', () => {
    const arabic = readRoster('الرقم,الاسم\r\n00713,سارة الزهراني\r\n00714,عبدالله\r\n');
    expect(arabic.hadHeader).toBe(true);
    expect(arabic.students).toEqual([
      { id: '00713', name: 'سارة الزهراني' },
      { id: '00714', name: 'عبدالله' },
    ]);

    const english = readRoster('Student ID;Name\r\n00713;Sara\r\n');
    expect(english.delimiter).toBe(';');
    expect(english.students[0]?.id).toBe('00713');
  });

  it('reads a file with no headings at all', () => {
    const roster = readRoster('00713,سارة\r\n00714,عبدالله\r\n');
    expect(roster.hadHeader).toBe(false);
    expect(roster.students).toHaveLength(2);
  });

  it('reads the columns in whichever order the school put them', () => {
    const roster = readRoster('name,id\r\nسارة,00713\r\n');
    expect(roster.students[0]).toEqual({ id: '00713', name: 'سارة' });
  });
});

describe('the identifier is text, and this is where that is decided', () => {
  it('keeps every leading zero', () => {
    // An id that lost its zeros no longer matches the grid the student shaded,
    // so the scan reconciles against nothing and the mark lands on no one.
    const roster = readRoster('id,name\r\n00713,سارة\r\n000,عبدالله\r\n0,خالد\r\n');
    expect(roster.students.map((student) => student.id)).toEqual(['00713', '000', '0']);
  });

  it('carries a vocalised Arabic name byte for byte', () => {
    // Five code points longer than it looks. Nothing here normalises, folds or
    // strips marks, because any of those changes what the teacher gave us.
    const name = 'عَبْدُالله';
    const roster = readRoster(`id,name\r\n1,${name}\r\n`);
    expect(roster.students[0]?.name).toBe(name);
    expect(roster.students[0]?.name.length).toBe(name.length);
  });

  it('trims the whitespace a spreadsheet leaves, and nothing else', () => {
    const roster = readRoster('id,name\r\n  00713  ,  سارة  \r\n');
    expect(roster.students[0]).toEqual({ id: '00713', name: 'سارة' });
  });
});

describe('nothing is dropped without saying so', () => {
  it('reports a row it could not import, with its line number', () => {
    // A teacher who imports 28 of 30 and is not told is a teacher who finds out
    // at the exam.
    const roster = readRoster('id,name\r\n00713,سارة\r\n,عبدالله\r\n00715,\r\n00713,مكرر\r\n');
    expect(roster.students).toHaveLength(1);
    expect(roster.faults).toEqual([
      { row: 3, reason: 'no id', detail: 'عبدالله' },
      { row: 4, reason: 'no name', detail: '00715' },
      { row: 5, reason: 'duplicate id', detail: '00713, first seen on row 2' },
    ]);
  });

  it('refuses an identifier that begins with a formula character, at the door', () => {
    // Refused on import rather than defused on export: a defused id no longer
    // matches the paper, and criterion 19 compares them byte for byte.
    const roster = readRoster('id,name\r\n=cmd,سارة\r\n00713,عبدالله\r\n');
    expect(roster.students).toHaveLength(1);
    expect(roster.faults[0]).toMatchObject({ row: 2, reason: 'formula in id' });
  });

  it('ignores a blank row instead of counting it as a student', () => {
    const roster = readRoster('id,name\r\n00713,سارة\r\n\r\n00714,عبدالله\r\n');
    expect(roster.students).toHaveLength(2);
    expect(roster.faults).toEqual([]);
  });
});
