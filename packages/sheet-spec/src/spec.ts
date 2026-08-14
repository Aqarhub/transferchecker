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

export const LABEL_PLACEMENTS = ['internal', 'external'] as const;

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

export const BubbleMetricsSchema = z.object({
  radiusMm: z.number().min(1.6).max(3.5),
  pitchXMm: z.number().min(5).max(12),
  /** Row spacing in the question grid. */
  pitchYMm: z.number().min(6).max(14),
  /** Row spacing inside bubble grids, which are usually tighter. */
  gridPitchYMm: z.number().min(5).max(14),
});

export const SheetSpecSchema = z.object({
  templateId: z.uuid(),
  version: z.literal(3),
  /** Printed on the right edge, so a teacher can identify a sheet by eye. */
  name: z.string().min(1).max(40),
  /** Vertical text on the left edge, typically the product name. */
  branding: z.string().max(30),
  paper: z.enum(PAPER_NAMES),
  /** 'auto' derives the count from row width and the space available. */
  columns: z.union([z.literal('auto'), z.number().int().min(1).max(6)]).default('auto'),
  questions: z.array(QuestionSchema).min(1).max(200),
  headerFields: z.array(HeaderFieldSchema).max(8),
  bubble: BubbleMetricsSchema,
});

export type FieldUsage = (typeof FIELD_USAGES)[number];
export type FieldWidth = (typeof FIELD_WIDTHS)[number];
export type LabelPlacement = (typeof LABEL_PLACEMENTS)[number];
export type SelectMode = (typeof SELECT_MODES)[number];
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
