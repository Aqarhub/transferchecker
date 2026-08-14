// Rebuilds a sheet specification from the bytes a printed code carries.
//
// This is the half that makes a sheet self describing. A device that has never
// seen the template reads the code, rebuilds the geometry, and grades the paper
// with no network and no account.
//
// Every step returns null rather than throwing or guessing, and the result is
// validated through SheetSpecSchema before it leaves, so a damaged read can
// never turn into a plausible looking sheet that grades wrongly.

import { PAPER_NAMES } from '../paper';
import { FIELD_USAGES, FIELD_WIDTHS, SheetSpecSchema } from '../spec';
import type { SheetSpec, SheetSpecInput } from '../spec';
import { base32Decode } from './base32';
import { CODE_FORMAT } from './encode';
import { CUSTOM_SET, symbolsOfSet } from './symbols';
import { bytesToUuid } from './uuid';

export type DecodedCode =
  | { readonly mode: 'short'; readonly templateId: string }
  | { readonly mode: 'full'; readonly templateId: string; readonly spec: SheetSpec };

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** A cursor over the payload. `at` past the end is how a short read surfaces. */
interface Reader {
  readonly bytes: Uint8Array;
  at: number;
}

function byte(reader: Reader): number | null {
  const value = reader.bytes[reader.at];
  if (value === undefined) return null;
  reader.at += 1;
  return value;
}

function symbols(reader: Reader): readonly string[] | null {
  const descriptor = byte(reader);
  if (descriptor === null) return null;
  const setId = descriptor >> 4;
  const count = descriptor & 0x0f;
  if (count < 2 || count > 10) return null;
  if (setId !== CUSTOM_SET) return symbolsOfSet(setId, count);

  const out: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const length = byte(reader);
    if (length === null || length < 1 || length > 8) return null;
    const slice = reader.bytes.slice(reader.at, reader.at + length);
    if (slice.length !== length) return null;
    reader.at += length;
    try {
      out.push(utf8.decode(slice));
    } catch {
      // Not valid UTF-8, so the read is damaged rather than merely unfamiliar.
      return null;
    }
  }
  return out;
}

function field(reader: Reader, index: number): SheetSpecInput['headerFields'][number] | null {
  const head = byte(reader);
  if (head === null) return null;
  const usage = FIELD_USAGES[(head >> 4) & 0x07];
  if (usage === undefined) return null;
  // A label is cosmetic and is not carried, so the usage stands in for it. The
  // application shows a translated name for the usage instead.
  const common = { id: `f${String(index)}`, usage, label: usage };

  if ((head & 0x80) === 0) {
    const width = FIELD_WIDTHS[(head >> 2) & 0x03];
    if (width === undefined) return null;
    return { ...common, kind: 'writtenBox', width };
  }

  const found = symbols(reader);
  if (found === null) return null;
  return { ...common, kind: 'bubbleGrid', length: (head & 0x0f) + 1, symbols: [...found] };
}

function questions(reader: Reader): SheetSpecInput['questions'] | null {
  const runCount = byte(reader);
  if (runCount === null || runCount < 1) return null;

  const out: SheetSpecInput['questions'] = [];
  for (let run = 0; run < runCount; run += 1) {
    const count = byte(reader);
    const flags = byte(reader);
    if (count === null || flags === null || count < 1) return null;
    const found = symbols(reader);
    if (found === null) return null;
    for (let index = 0; index < count; index += 1) {
      out.push({
        kind: 'choice',
        symbols: [...found],
        placement: (flags & 0x80) === 0 ? 'internal' : 'external',
        select: (flags & 0x40) === 0 ? 'one' : 'many',
      });
    }
  }
  return out;
}

export function decodeSheetBytes(bytes: Uint8Array): DecodedCode | null {
  const reader: Reader = { bytes, at: 0 };
  const head = byte(reader);
  if (head === null || head >> 4 !== CODE_FORMAT) return null;

  const mode = (head & 0x0f) === 0 ? 'short' : 'full';
  if (bytes.length < 17) return null;
  const templateId = bytesToUuid(bytes, 1);
  reader.at = 17;
  if (mode === 'short') {
    return bytes.length === 17 ? { mode, templateId } : null;
  }

  const geometry = byte(reader);
  if (geometry === null) return null;
  const paper = PAPER_NAMES[geometry >> 7];
  const columnCount = (geometry >> 4) & 0x07;
  if (paper === undefined) return null;

  const metrics: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const tenths = byte(reader);
    if (tenths === null) return null;
    metrics.push(tenths / 10);
  }
  const [radiusMm, pitchXMm, pitchYMm, gridPitchYMm] = metrics;
  if (
    radiusMm === undefined ||
    pitchXMm === undefined ||
    pitchYMm === undefined ||
    gridPitchYMm === undefined
  ) {
    return null;
  }

  const fieldCount = byte(reader);
  if (fieldCount === null) return null;
  const headerFields: SheetSpecInput['headerFields'] = [];
  for (let index = 0; index < fieldCount; index += 1) {
    const found = field(reader, index);
    if (found === null) return null;
    headerFields.push(found);
  }

  const found = questions(reader);
  if (found === null) return null;
  // Trailing bytes mean the payload was not produced by this format, so it is
  // rejected rather than partly believed.
  if (reader.at !== bytes.length) return null;

  const parsed = SheetSpecSchema.safeParse({
    templateId,
    version: 3,
    // Neither is carried: both are printed text and neither moves a bubble.
    name: '?',
    branding: '',
    paper,
    columns: columnCount === 0 ? 'auto' : columnCount,
    questions: found,
    headerFields,
    bubble: { radiusMm, pitchXMm, pitchYMm, gridPitchYMm },
    code: 'full',
  } satisfies SheetSpecInput);

  return parsed.success ? { mode, templateId, spec: parsed.data } : null;
}

export function decodeSheetCode(text: string): DecodedCode | null {
  const bytes = base32Decode(text);
  return bytes === null ? null : decodeSheetBytes(bytes);
}
