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
import { FIELD_USAGES, FIELD_WIDTHS } from '../spec';
import type { HeaderField, Question, SheetSpec } from '../spec';
import { base32Encode } from './base32';
import { CUSTOM_SET, symbolSetId } from './symbols';
import { uuidToBytes } from './uuid';

export const CODE_FORMAT = 1;

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

  const paper = PAPER_NAMES.indexOf(spec.paper);
  const columns = spec.columns === 'auto' ? 0 : spec.columns;
  bytes.push((paper << 7) | (columns << 4));

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
    bytes.push(
      (run.question.placement === 'external' ? 0x80 : 0) |
        (run.question.select === 'many' ? 0x40 : 0),
    );
    writeSymbols(bytes, run.question.symbols);
  }

  return Uint8Array.from(bytes);
}

/** The text printed into the code. Base32 keeps it in the QR alphanumeric set. */
export function encodeSheetCode(spec: SheetSpec): string {
  return base32Encode(encodeSheetBytes(spec));
}
