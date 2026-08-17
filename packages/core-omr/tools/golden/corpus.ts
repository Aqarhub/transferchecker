// The synthetic corpus: tier 0 of the golden set.
//
// Three hundred real photographs are what the accuracy claim needs and this is
// not them. What this is: every named failure mode in docs/FAILURE-MODES.md
// crossed with every stock template, drawn from the same layout object the PDF
// generator draws from, so that a defense which stops working says so on the
// same day rather than in a classroom.
//
// The axes are chosen, not swept blindly. Each one exists because something in
// the engine can only be wrong along it:
//
//   answered fraction   any page wide normalisation dies here, and only here
//   framing             the resolution gate and the code's own module size
//   lighting            the photometric reference and the glare channel
//   printing            weak toner, which is where the absolute floor lives
//   marks               what a student's hand actually leaves on paper
//   geometry            curl, print scale, a lost mark, two sheets in a frame
//
// Every case is a pure function of its own fields, so a failure reproduces from
// its id alone and nothing is committed as an image.

import { PAPER, layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import type { SheetLayout, SheetSpec, StockTemplate } from '@transferchecker/sheet-spec';
import type { Rejection } from '../../src/scan/reject';
import { DEFAULT_INK } from '../render';
import type { Ink, PencilMark } from '../render';
import type { PhotographOptions } from '../photograph';

export const STRATA = ['clean', 'framing', 'lighting', 'printing', 'marks', 'geometry'] as const;
export type Stratum = (typeof STRATA)[number];

export interface GoldenCase {
  readonly id: string;
  readonly stratum: Stratum;
  readonly template: StockTemplate;
  /** What the student's pencil did. The truth of the case is derived from this. */
  readonly marks: readonly PencilMark[];
  /** Pixels per millimetre of the flat page before any camera. */
  readonly pxPerMm?: number;
  /** How the page was printed: its toner, and any scale error. */
  readonly ink?: Ink;
  readonly printScale?: number;
  /** How it was photographed. Absent means the flat page is read directly. */
  readonly photo?: PhotographOptions;
  /** A cylindrical curl about a vertical axis, in millimetres at mid page. */
  readonly bendMm?: number;
  /** Timing mark rows painted over, as a pen line down the margin does. */
  /** Edge marks to paint over, by index into the layout's four. */
  readonly coverMarks?: readonly number[];
  /** Draw dark logo blocks in the letterhead band, as a school's header would. */
  readonly letterheadInk?: boolean;
  /** Two sheets tiled on one carrier, which is what the 2 up print path makes. */
  readonly twoUp?: boolean;
  /** Graded, or refused by this named cause. Both are correct answers. */
  readonly expect: 'graded' | Rejection['kind'];
  /**
   * What the marks string may and must carry, defense د20's alphabet.
   *
   * Verdict counts are structurally blind to a flag that rides on a correct
   * outcome: [measured] at a printed contrast of 96 every question of a quick20
   * sheet came back `e`, answered and blank alike, while the sweep scored those
   * pages 50 of 50 correct with every gate green. A teacher would have been
   * asked to review every question of every page and the report would have said
   * 100 percent. So a case says which characters belong on it.
   */
  readonly chars?: { readonly only?: readonly string[]; readonly atLeast?: readonly string[] };
  readonly why: string;
}

const TEXT = {
  name: 'Golden',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

const CACHE = new Map<StockTemplate, { spec: SheetSpec; layout: SheetLayout }>();

/** The stock sheet, laid out once per template and shared by every case. */
export function sheetOf(kind: StockTemplate): { spec: SheetSpec; layout: SheetLayout } {
  const held = CACHE.get(kind);
  if (held !== undefined) return held;
  const spec = stockTemplate(kind, TEXT);
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') throw new Error(`${kind} does not lay out`);
  const made = { spec, layout: result.layout };
  CACHE.set(kind, made);
  return made;
}

/** A small deterministic generator, so a case's id is enough to reproduce it. */
function randomFrom(seed: number): () => number {
  let state = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

/** A soft pencil, fully shaded: what the printed instruction asks for. */
const PENCIL = 55;

/**
 * A student answering `fraction` of the questions, spread over the page rather
 * than clustered, because a page wide statistic is a function of WHERE the ink
 * is as well as how much of it there is.
 */
export function answerFraction(layout: SheetLayout, fraction: number, seed: number): PencilMark[] {
  const rows = layout.questionColumns.flatMap((column) => column.rows);
  const random = randomFrom(seed);
  const wanted = Math.round(rows.length * fraction);
  const marks: PencilMark[] = [];

  for (const [index, row] of rows.entries()) {
    // Evenly spaced by construction: the nth answered question is the one whose
    // index crosses the next multiple of the spacing.
    if (wanted === 0) break;
    const due =
      Math.floor((index * wanted) / rows.length) < Math.floor(((index + 1) * wanted) / rows.length);
    if (!due) continue;
    const choices = row.bubbles;
    const pick = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
    if (pick === undefined) continue;
    marks.push({
      groupId: `q:${String(row.question)}`,
      symbol: pick.symbol,
      coverage: 0.92,
      value: PENCIL,
    });
  }
  return marks;
}

/** Identity digits, which is the field a partly filled grid ruins quietly. */
export function identityDigits(digits: readonly string[]): PencilMark[] {
  return digits.map((digit, column) => ({
    groupId: `f:studentId:${String(column)}`,
    symbol: digit,
    coverage: 0.9,
    value: PENCIL,
  }));
}

/** Weak toner: a third generation photocopy, at the contrast the engine accepts. */
export function tonerAt(inkValue: number): Ink {
  return {
    ...DEFAULT_INK,
    ink: inkValue,
    bubbleStroke: Math.max(inkValue, DEFAULT_INK.bubbleStroke),
    bubbleLabel: Math.max(inkValue, DEFAULT_INK.bubbleLabel),
    boxStroke: Math.max(inkValue, DEFAULT_INK.boxStroke),
  };
}

/** A frame from a phone held at a plausible distance and angle. */
export function framing(
  width: number,
  height: number,
  extra: Partial<PhotographOptions> = {},
): PhotographOptions {
  return {
    width,
    height,
    fill: 0.86,
    yawDeg: 4,
    pitchDeg: 3,
    rollDeg: -2,
    noise: 3,
    blur: 1,
    seed: 17,
    ...extra,
  };
}

/** The paper height of a template, so a shadow can be written in its own terms. */
export function paperHeightMm(kind: StockTemplate): number {
  return PAPER[sheetOf(kind).spec.paper].heightMm;
}
