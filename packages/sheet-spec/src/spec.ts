// The sheet specification: the single source of truth for both the PDF
// generator and the scanner. Everything printed on a sheet is a pure function
// of this object, so the two sides can never drift apart.

import { z } from 'zod';
import { MAX_SYMBOLS } from './alphabet';
import { PAPER_NAMES } from './paper';

/**
 * What a field means to the system, kept separate from what it says to a
 * reader. Without this the system cannot tell which box holds the student
 * name, so a scan cannot be matched to a record or given a column heading.
 */
export const FIELD_USAGES = [
  'studentName',
  'studentId',
  'class',
  'subject',
  'date',
  'score',
  'keyVersion',
  'other',
] as const;

export const FIELD_WIDTHS = ['small', 'medium', 'large'] as const;

/** Bubble symbols. Two to ten, each one or two characters. */
const SymbolsSchema = z.array(z.string().min(1).max(2)).min(2).max(MAX_SYMBOLS);

const fieldId = z.string().min(1).max(24);
const fieldLabel = z.string().min(1).max(40);

/** A header field the student fills by hand. The scanner never reads it. */
export const WrittenBoxFieldSchema = z.object({
  id: fieldId,
  usage: z.enum(FIELD_USAGES),
  label: fieldLabel,
  kind: z.literal('writtenBox'),
  width: z.enum(FIELD_WIDTHS).default('medium'),
});

/**
 * A field the student fills by shading, one column per character. A student
 * id and a key version are both instances of this, which is why neither needs
 * a special case anywhere downstream.
 */
export const BubbleGridFieldSchema = z.object({
  id: fieldId,
  usage: z.enum(FIELD_USAGES),
  label: fieldLabel,
  kind: z.literal('bubbleGrid'),
  length: z.number().int().min(1).max(12),
  symbols: SymbolsSchema,
});

export const HeaderFieldSchema = z.discriminatedUnion('kind', [
  WrittenBoxFieldSchema,
  BubbleGridFieldSchema,
]);

/**
 * Where a choice letter is printed. Three real options, and the teacher picks.
 *
 * 'internal' puts the letter inside its bubble. Every bubble says what it is,
 * with nothing to look up. This is the default.
 *
 * 'header' prints the letters once above the column and leaves the bubbles
 * empty, the way commercial answer sheets are drawn. A forty question sheet
 * prints five letters instead of two hundred, so the page is much quieter, and
 * the bubbles may be smaller because an empty bubble only has to be large
 * enough to aim at rather than large enough to read a letter in.
 *
 * 'external' puts the letter beside each bubble. The most legible and the
 * widest, at roughly double the row width.
 */
export const LABEL_PLACEMENTS = ['internal', 'header', 'external'] as const;

/**
 * How many bubbles a student may fill. 'one' is the ordinary case, where a
 * second filled bubble means the answer is ambiguous. 'many' is check all that
 * apply, where several filled bubbles are the answer.
 *
 * This lives on the question rather than only on the answer key so that a
 * sheet stays self describing: the scanner can tell a genuine multi answer
 * from an ambiguous one without holding the key.
 */
export const SELECT_MODES = ['one', 'many'] as const;

/**
 * A multiple choice question. `placement` decides whether the letter sits
 * inside the bubble or beside it, which roughly doubles the row width and is
 * the teacher's trade between density and legibility.
 */
export const ChoiceQuestionSchema = z.object({
  kind: z.literal('choice'),
  symbols: SymbolsSchema,
  placement: z.enum(LABEL_PLACEMENTS).default('internal'),
  select: z.enum(SELECT_MODES).default('one'),
});

// A union of one today. Verbose, numeric and short response questions are
// designed in docs/SHEET-SPEC-V3.md and join here without a migration.
export const QuestionSchema = z.discriminatedUnion('kind', [ChoiceQuestionSchema]);

/**
 * Every metric is a whole number of tenths of a millimetre. Consumer printers
 * cannot hold finer than that, and the tenth is also the unit the printed code
 * carries, so a sheet rebuilt from its own code has exactly the geometry it was
 * printed with rather than a rounded copy of it.
 */
const metricMm = (min: number, max: number): z.ZodNumber =>
  z.number().min(min).max(max).multipleOf(0.1);

/**
 * White paper that must remain between one bubble's edge and the next.
 *
 * Without it the ranges alone permit bubbles that touch or overlap: a 3.5 mm
 * radius at a 5 mm pitch puts a seven millimetre circle every five
 * millimetres. Bubbles crowded to that point are the oldest complaint about
 * machine graded forms, and they defeat the scanner too, because a mark that
 * strays out of one bubble lands inside its neighbour.
 */
const BUBBLE_GAP_MM = 1;

export const BubbleMetricsSchema = z
  .object({
    radiusMm: metricMm(1.6, 3.5),
    pitchXMm: metricMm(5, 12),
    /**
     * Row spacing in the question grid.
     *
     * The floor is 5.5 rather than 6 because defense د1 moved the corner
     * squares out of the printer's dead zone and took 16 mm of page height with
     * them, and a hundred question sheet on US Letter does not fit without it.
     * It is a floor and not the printed pitch: the grid spreads its rows to use
     * the height it was given, so the same sheet still prints at 6.1 mm on A4.
     *
     * It is safe to lower because the cross field rule below is what actually
     * keeps bubbles apart: at 5.5 mm the radius may not exceed 2.25 mm.
     */
    pitchYMm: metricMm(5.5, 14),
    /** Row spacing inside bubble grids, which are usually tighter. */
    gridPitchYMm: metricMm(5, 14),
  })
  // Each range is sane on its own and the combinations are not, so this is
  // checked across fields rather than field by field.
  .refine(
    (bubble) =>
      Math.min(bubble.pitchXMm, bubble.pitchYMm, bubble.gridPitchYMm) >=
      2 * bubble.radiusMm + BUBBLE_GAP_MM,
    {
      message: `bubbles would touch: every pitch must be at least twice the radius plus ${String(BUBBLE_GAP_MM)}mm`,
      path: ['pitchXMm'],
    },
  );

/**
 * How much the printed code carries.
 *
 * 'full' makes the sheet self describing: the code holds the whole geometry, so
 * a device that has never seen the template can still grade the paper, with no
 * network, no account and nobody sharing anything. That is the right default.
 *
 * 'short' carries the template id alone. The code is smaller on the page, and
 * the paper is only readable by a device that already holds the template. It
 * stays available because the trade is a real one and the teacher owns it.
 */
export const SHEET_CODES = ['full', 'short'] as const;

export const SheetSpecSchema = z.object({
  templateId: z.uuid(),
  /**
   * Four, because `paper.ts` says its constants are part of the printed
   * artifact and that changing them is a breaking change. Defenses د1, د3 and
   * د6 changed the margins, the timing mark and the code module, and the sheet
   * gained the anchor columns, so a version 3 sheet is a different piece of
   * paper and must be refused rather than graded against these numbers.
   */
  version: z.literal(4),
  /** Printed on the right edge, so a teacher can identify a sheet by eye. */
  name: z.string().min(1).max(40),
  /** Vertical text on the right edge, typically the product name. */
  branding: z.string().max(30),
  paper: z.enum(PAPER_NAMES),
  /** 'auto' derives the count from row width and the space available. */
  columns: z.union([z.literal('auto'), z.number().int().min(1).max(6)]).default('auto'),
  questions: z.array(QuestionSchema).min(1).max(200),
  headerFields: z.array(HeaderFieldSchema).max(8),
  bubble: BubbleMetricsSchema,
  /** How much the printed code carries. Changes the code's printed size. */
  code: z.enum(SHEET_CODES).default('full'),
});

export type FieldUsage = (typeof FIELD_USAGES)[number];
export type FieldWidth = (typeof FIELD_WIDTHS)[number];
export type LabelPlacement = (typeof LABEL_PLACEMENTS)[number];
export type SelectMode = (typeof SELECT_MODES)[number];
export type SheetCodeMode = (typeof SHEET_CODES)[number];
export type WrittenBoxField = z.output<typeof WrittenBoxFieldSchema>;
export type BubbleGridField = z.output<typeof BubbleGridFieldSchema>;
export type HeaderField = z.output<typeof HeaderFieldSchema>;
export type ChoiceQuestion = z.output<typeof ChoiceQuestionSchema>;
export type Question = z.output<typeof QuestionSchema>;
export type BubbleMetrics = z.output<typeof BubbleMetricsSchema>;
export type SheetSpec = z.output<typeof SheetSpecSchema>;
export type SheetSpecInput = z.input<typeof SheetSpecSchema>;

/**
 * Bubble metrics that print and scan reliably on consumer printers.
 *
 * A 4 mm bubble is about 19 pixels across once a frame is warped to the
 * standard 1000 px page width, which is ample area for a fill ratio and still
 * holds a legible letter inside, which the default placement needs.
 *
 * The spacing is deliberately tighter than the bubble strictly requires. A page
 * of widely spaced bubbles is tiring to look at and pushes a short exam onto
 * paper it does not need, and the student's eye tracks a compact column far
 * more easily than a sparse one.
 */
export const DEFAULT_BUBBLE: BubbleMetrics = {
  radiusMm: 2,
  pitchXMm: 5.6,
  pitchYMm: 7,
  gridPitchYMm: 6,
};
