// Packs a sheet specification into the bytes the printed code carries.
//
// The format is positional and has no field names, because every byte here is
// printed area and printed area is what a phone camera has to resolve. It
// carries geometry only: names, labels and branding are cosmetic, they never
// move a bubble, and leaving them out is most of why the code stays small.
//
// IMPORTANT: this format is part of the printed artifact. A sheet printed today
// must still decode years from now, so set ids and field order may never be
// renumbered. A change means a new CODE_FORMAT, not an edit to this one.

import { PAPER_NAMES } from '../paper';
import { FIELD_USAGES, FIELD_WIDTHS, LABEL_PLACEMENTS } from '../spec';
import type { HeaderField, Question, SheetSpec } from '../spec';
import { base32Encode } from './base32';
import { CUSTOM_SET, symbolSetId } from './symbols';
import { uuidToBytes } from './uuid';

export const CODE_FORMAT = 2;

const utf8 = new TextEncoder();

/**
 * A symbol set: one byte of set id and count, then the symbols themselves only
 * when they did not come from a preset. Each custom symbol is length prefixed
 * rather than separated, so no character can be mistaken for a separator.
 */
function writeSymbols(bytes: number[], symbols: readonly string[]): void {
  const setId = symbolSetId(symbols);
  bytes.push((setId << 4) | symbols.length);
  if (setId !== CUSTOM_SET) return;
  for (const symbol of symbols) {
    const encoded = utf8.encode(symbol);
    bytes.push(encoded.length, ...encoded);
  }
}

function writeField(bytes: number[], field: HeaderField): void {
  const usage = FIELD_USAGES.indexOf(field.usage);
  if (field.kind === 'writtenBox') {
    bytes.push((usage << 4) | (FIELD_WIDTHS.indexOf(field.width) << 2));
    return;
  }
  bytes.push(0x80 | (usage << 4) | (field.length - 1));
  writeSymbols(bytes, field.symbols);
}

interface Run {
  count: number;
  question: Question;
}

const sameQuestion = (a: Question, b: Question): boolean =>
  a.placement === b.placement &&
  a.select === b.select &&
  a.symbols.length === b.symbols.length &&
  a.symbols.every((symbol, index) => symbol === b.symbols[index]);

/**
 * Consecutive identical questions collapse to one run. Nearly every sheet is
 * forty of the same question, so this is the difference between a payload of a
 * few bytes and one of a few hundred.
 */
function runsOf(questions: readonly Question[]): Run[] {
  const runs: Run[] = [];
  for (const question of questions) {
    const last = runs.at(-1);
    if (last !== undefined && last.count < 200 && sameQuestion(last.question, question)) {
      last.count += 1;
    } else {
      runs.push({ count: 1, question });
    }
  }
  return runs;
}

export function encodeSheetBytes(spec: SheetSpec): Uint8Array {
  const short = spec.code === 'short';
  const bytes: number[] = [(CODE_FORMAT << 4) | (short ? 0 : 1)];
  bytes.push(...uuidToBytes(spec.templateId));
  if (short) return Uint8Array.from(bytes);

  // Three bits of paper and three of columns, with the low two spare.
  //
  // Format 1 gave the paper a single bit, which silently truncated every paper
  // past LETTER: an A5 sheet encoded a geometry byte of zero and decoded as A4,
  // so a scanner rebuilt the wrong page size and every bubble coordinate with
  // it. Two of the three stock templates are not A4, so this was the ordinary
  // path rather than an edge. Format 2 is the fix, and the version is bumped
  // rather than the packing quietly corrected, because a format 1 sheet should
  // now be refused rather than graded against a page size it never had.
  const paper = PAPER_NAMES.indexOf(spec.paper);
  const columns = spec.columns === 'auto' ? 0 : spec.columns;
  if (paper < 0 || paper > 7 || columns < 0 || columns > 7) {
    throw new Error('sheet code: paper or column count does not fit the geometry byte');
  }
  bytes.push((paper << 5) | (columns << 2));

  const { radiusMm, pitchXMm, pitchYMm, gridPitchYMm } = spec.bubble;
  for (const value of [radiusMm, pitchXMm, pitchYMm, gridPitchYMm]) {
    bytes.push(Math.round(value * 10));
  }

  bytes.push(spec.headerFields.length);
  for (const field of spec.headerFields) writeField(bytes, field);

  const runs = runsOf(spec.questions);
  bytes.push(runs.length);
  for (const run of runs) {
    bytes.push(run.count);
    // Two bits of placement and one of select mode.
    //
    // A single bit for placement was the same defect as the single bit for
    // paper, in the same byte layout, and just as silent. LABEL_PLACEMENTS has
    // THREE members, so 'header' encoded as 0 and decoded as 'internal': a
    // 'header' sheet prints a row of choice letters above each column, which
    // costs `choiceHeaderMm` of height and moves the whole grid. Measured on a
    // 40 question A4 sheet, every bubble landed 3.8 mm from where the decoded
    // spec said it was, growing to about 11 mm by the twentieth row, and the
    // scanner would have blamed the timing mark residual and told the teacher
    // the paper was not flat.
    const placement = LABEL_PLACEMENTS.indexOf(run.question.placement);
    if (placement < 0 || placement > 3) {
      throw new Error('sheet code: label placement does not fit the question flags');
    }
    bytes.push((placement << 6) | (run.question.select === 'many' ? 0x20 : 0));
    writeSymbols(bytes, run.question.symbols);
  }

  return Uint8Array.from(bytes);
}

/** The text printed into the code. Base32 keeps it in the QR alphanumeric set. */
export function encodeSheetCode(spec: SheetSpec): string {
  return base32Encode(encodeSheetBytes(spec));
}
