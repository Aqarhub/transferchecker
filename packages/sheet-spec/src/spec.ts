// The sheet specification: the single source of truth for both the PDF
// generator and the scanner. Everything printed on a sheet is a pure function
// of this object, so the two sides can never drift apart.

import { z } from 'zod';
import { ALPHABET_NAMES } from './alphabet';
import { CHOICE_LABEL_NAMES, MAX_CHOICES } from './alphabet';
import { PAPER_NAMES } from './paper';

const fieldId = z.string().min(1).max(24);
const fieldLabel = z.string().min(1).max(40);

/**
 * A header field the student fills by hand. The label is free text in any
 * language; only the box position matters to the scanner, which never reads it.
 */
export const WrittenBoxFieldSchema = z.object({
  id: fieldId,
  label: fieldLabel,
  kind: z.literal('writtenBox'),
  widthMm: z.number().min(20).max(120).default(60),
});

/**
 * A header field the student fills by shading bubbles, one column per
 * character. A student id is just an instance of this with digit columns, so a
 * teacher can drop it, resize it, or replace it with a bubbled name.
 */
export const BubbleGridFieldSchema = z.object({
  id: fieldId,
  label: fieldLabel,
  kind: z.literal('bubbleGrid'),
  length: z.number().int().min(1).max(12),
  alphabet: z.enum(ALPHABET_NAMES),
});

export const HeaderFieldSchema = z.discriminatedUnion('kind', [
  WrittenBoxFieldSchema,
  BubbleGridFieldSchema,
]);

export const BubbleMetricsSchema = z.object({
  radiusMm: z.number().min(1.6).max(3.5),
  pitchXMm: z.number().min(5).max(12),
  /** Row spacing in the question grid. */
  pitchYMm: z.number().min(6).max(14),
  /** Row spacing inside sidebar grids, which are usually tighter. */
  gridPitchYMm: z.number().min(5).max(14),
});

export const SheetSpecSchema = z.object({
  templateId: z.uuid(),
  version: z.literal(2),
  paper: z.enum(PAPER_NAMES),
  questions: z.number().int().min(1).max(200),
  choices: z.number().int().min(2).max(MAX_CHOICES),
  columns: z.number().int().min(1).max(4),
  /** Script used for the answer-choice letters printed inside the bubbles. */
  choiceLabels: z.enum(CHOICE_LABEL_NAMES),
  /** Vertical text on the left edge, typically the site name. */
  branding: z.string().max(30),
  /** Vertical text on the right edge, free text in any language. */
  title: z.string().max(60),
  /** Distinguishes shuffled variants of the same exam. */
  formCode: z.string().regex(/^[A-D]$/),
  headerFields: z.array(HeaderFieldSchema).max(8),
  bubble: BubbleMetricsSchema,
});

export type WrittenBoxField = z.output<typeof WrittenBoxFieldSchema>;
export type BubbleGridField = z.output<typeof BubbleGridFieldSchema>;
export type HeaderField = z.output<typeof HeaderFieldSchema>;
export type BubbleMetrics = z.output<typeof BubbleMetricsSchema>;
export type SheetSpec = z.output<typeof SheetSpecSchema>;
export type SheetSpecInput = z.input<typeof SheetSpecSchema>;

/**
 * Bubble metrics that print and scan reliably on consumer printers.
 *
 * A 4.4 mm bubble is about 21 pixels across once a frame is warped to the
 * standard 1000 px page width, which leaves ample area for a fill ratio while
 * still fitting three question columns and an id grid side by side on A4.
 */
export const DEFAULT_BUBBLE: BubbleMetrics = {
  radiusMm: 2.2,
  pitchXMm: 6.2,
  pitchYMm: 8,
  gridPitchYMm: 6.8,
};
