// Importing a class list, which is the barrier to entry PLAN.md section 0 names.
//
// Without it a teacher types thirty names by hand before this product has shown
// them anything at all. So the file they already have has to work: whatever
// their spreadsheet exported, in whatever locale, with whatever they called the
// columns.
//
// THE IDENTIFIER IS TEXT AND NEVER A NUMBER. A student id of `00713` is not
// seven hundred and thirteen. Every spreadsheet on earth will drop those zeros
// given the chance, and an id that lost them no longer matches the grid the
// student shaded on the paper, so the scan reconciles against nothing and the
// mark lands on no one. Acceptance criterion 19 requires the ids to survive the
// round trip byte for byte, and that starts by never parsing them as numbers.
//
// AND A NAME IS ARABIC, WITH DIACRITICS. `عَبْدُالله` is five code points longer
// than it looks and normalising it would change the bytes the teacher gave us.
// Nothing here trims, folds, strips marks or reorders: the name is carried
// exactly as it arrived, and only surrounding whitespace is removed.

import { detectDelimiter, parseCsv, startsFormula } from './csv';

export interface Student {
  /** As the school writes it, leading zeros and all. Never parsed as a number. */
  readonly id: string;
  readonly name: string;
}

export interface RosterFault {
  /** One based, counting the header, so it matches what the teacher sees. */
  readonly row: number;
  readonly reason: 'no id' | 'no name' | 'duplicate id' | 'formula in id';
  readonly detail: string;
}

export interface Roster {
  readonly students: readonly Student[];
  /** Rows that were not imported, each with the reason, so none vanish quietly. */
  readonly faults: readonly RosterFault[];
  readonly delimiter: string;
  /** True when the first row was read as headings rather than as a student. */
  readonly hadHeader: boolean;
}

// Both languages, because the file comes from the school's own system as often
// as from ours, and neither spelling is more correct than the other.
const ID_HEADERS = [
  'id',
  'student id',
  'studentid',
  'ext_id',
  'number',
  'الرقم',
  'رقم الطالب',
  'المعرف',
  'الهوية',
];
const NAME_HEADERS = ['name', 'student', 'student name', 'الاسم', 'اسم الطالب', 'الطالب'];

const normalise = (text: string): string => text.trim().toLowerCase();

/** Which columns hold the id and the name, or null when this is not a header. */
function headerOf(row: readonly string[]): { id: number; name: number } | null {
  const cells = row.map((cell) => normalise(cell));
  const id = cells.findIndex((cell) => ID_HEADERS.includes(cell));
  const name = cells.findIndex((cell) => NAME_HEADERS.includes(cell));
  if (id === -1 && name === -1) return null;
  // A file with only one of the two named still tells us which is which, and
  // guessing the other as the remaining column beats refusing the file.
  return {
    id: id === -1 ? (name === 0 ? 1 : 0) : id,
    name: name === -1 ? (id === 0 ? 1 : 0) : name,
  };
}

/**
 * A class list from whatever the school exported.
 *
 * Nothing throws and nothing is silently dropped: a row that cannot be imported
 * comes back in `faults` with its line number, because a teacher who imports 28
 * of 30 students and is not told is a teacher who finds out at the exam.
 */
export function readRoster(text: string): Roster {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  const first = rows[0];
  const header = first === undefined ? null : headerOf(first);
  const columns = header ?? { id: 0, name: 1 };
  const body = header === null ? rows : rows.slice(1);
  const offset = header === null ? 1 : 2;

  const students: Student[] = [];
  const faults: RosterFault[] = [];
  const seen = new Map<string, number>();

  for (const [at, row] of body.entries()) {
    const line = at + offset;
    const id = (row[columns.id] ?? '').trim();
    const name = (row[columns.name] ?? '').trim();
    if (id === '' && name === '') continue;

    if (id === '') {
      faults.push({ row: line, reason: 'no id', detail: name });
      continue;
    }
    if (name === '') {
      faults.push({ row: line, reason: 'no name', detail: id });
      continue;
    }
    // Refused at the door rather than defused at the exit. An id that begins
    // with a formula character would have to be rewritten on every export to be
    // safe, and a rewritten id no longer matches the paper.
    if (startsFormula(id)) {
      faults.push({ row: line, reason: 'formula in id', detail: id });
      continue;
    }
    const earlier = seen.get(id);
    if (earlier !== undefined) {
      faults.push({
        row: line,
        reason: 'duplicate id',
        detail: `${id}, first seen on row ${String(earlier)}`,
      });
      continue;
    }
    seen.set(id, line);
    students.push({ id, name });
  }

  return { students, faults, delimiter, hadHeader: header !== null };
}
