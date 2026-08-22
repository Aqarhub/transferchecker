// Turning a teacher's choices into a sheet, or saying exactly why it cannot.
//
// `templates.ts` is the same shape of function with the choices already made:
// three hardcoded shapes, and a `throw` when one of them does not fit, because
// a stock template that does not fit is a bug in this repository. A CUSTOM
// sheet is the opposite: not fitting is an ordinary thing a teacher will do on
// their way to a sheet that does, so every refusal here is data with the
// numbers in it, never an exception.
//
// AND IT TRIES DENSER ROWS BEFORE IT REFUSES, WHICH IS NOT A DETAIL. Measured
// on the A family: a hundred questions of five choices fits NO paper at the
// default row pitch, and fits A4 at 97 percent once the rows close up. That is
// exactly what `full100` does by hand, so a builder that only tried the default
// metrics would tell a teacher that a sheet this product ships is impossible.
// When it happens the result says so, because rows that quietly got tighter is
// a change to the paper in the teacher's hand.

import { arabicSymbols, digitSymbols, latinSymbols, trueFalseSymbols } from './alphabet';
import { MAX_SYMBOLS } from './alphabet';
import { smallestPaper } from './fit';
import { layoutSheet } from './layout/index';
import { PAPER_FAMILIES } from './paper';
import type { PaperFamily, PaperName } from './paper';
import { DEFAULT_BUBBLE, SheetSpecSchema } from './spec';
import type { BubbleMetrics, LabelPlacement, SelectMode, SheetSpec, SheetSpecInput } from './spec';
import type { OverflowArea } from './types';

export const ALPHABETS = ['latin', 'arabic', 'digits', 'trueFalse'] as const;
export type AlphabetName = (typeof ALPHABETS)[number];

const ALPHABET: Readonly<Record<AlphabetName, () => readonly string[]>> = {
  latin: () => latinSymbols(MAX_SYMBOLS),
  arabic: () => arabicSymbols(MAX_SYMBOLS),
  digits: () => digitSymbols(),
  trueFalse: () => trueFalseSymbols(),
};

/**
 * The closer rows the hundred question sheet is printed at.
 *
 * The same metrics `templates.ts` calls DENSE, and the same reasoning: the
 * bubble is what the scanner measures, so shrinking it costs accuracy, while
 * row pitch costs only reading comfort.
 */
const DENSE_ROWS: BubbleMetrics = { ...DEFAULT_BUBBLE, pitchYMm: 5.5, gridPitchYMm: 5.4 };

/** Question count bounds, from `SheetSpecSchema`, restated so a refusal can quote them. */
export const QUESTION_RANGE = { min: 1, max: 200 } as const;
/** Bubble grid length bounds, likewise. */
export const GRID_RANGE = { min: 1, max: 12 } as const;
/** A choice needs at least two symbols to be a choice. */
export const CHOICE_RANGE = { min: 2, max: MAX_SYMBOLS } as const;

export interface SheetChoices {
  /**
   * The template's identity, supplied rather than generated.
   *
   * It is printed into the code on every sheet, so a sheet reprinted next term
   * must carry the id it carried the first time. A function that minted one per
   * call would hand back a different sheet each time it was asked for the same
   * one, and the papers would stop resolving to their own template.
   */
  readonly templateId: string;
  /** Printed on the edge, so two sheets can be told apart by eye. */
  readonly name: string;
  readonly branding: string;
  readonly questions: number;
  readonly choices: number;
  readonly alphabet: AlphabetName;
  /**
   * Where the choice letter is printed: `internal` inside the bubble,
   * `header` once above the column, `external` beside each bubble at roughly
   * double the row width. All three change what fits, so this is a real input
   * to the paper decision and not decoration.
   */
  readonly placement: LabelPlacement;
  readonly select: SelectMode;
  /** Digits in the identity grid, or zero for a sheet that has none. */
  readonly studentId: number;
  /** How many key versions, or zero. Two or more, since one version is none. */
  readonly keyVersions: number;
  readonly family: PaperFamily;
  readonly labels: {
    readonly studentName: string;
    readonly studentId: string;
    readonly keyVersion: string;
  };
}

export type BuildRefusal =
  | { readonly kind: 'questions-out-of-range'; readonly asked: number }
  | { readonly kind: 'choices-out-of-range'; readonly asked: number }
  | {
      readonly kind: 'alphabet-too-small';
      readonly alphabet: AlphabetName;
      readonly asked: number;
      readonly available: number;
    }
  | { readonly kind: 'student-id-out-of-range'; readonly asked: number }
  | { readonly kind: 'key-versions-out-of-range'; readonly asked: number }
  /** The schema said no, which is a label too long or a name left empty. */
  | { readonly kind: 'rejected'; readonly field: string; readonly why: string }
  /** Nothing in the family holds it, even with the rows closed up. */
  | {
      readonly kind: 'does-not-fit';
      readonly paper: PaperName;
      readonly area: OverflowArea;
      readonly axis: 'width' | 'height';
      readonly neededMm: number;
      readonly availableMm: number;
    };

export type BuildResult =
  | {
      readonly kind: 'ok';
      readonly spec: SheetSpec;
      readonly paper: PaperName;
      /** Zero to one. Low means a mostly blank page, which reads as a mistake. */
      readonly fill: number;
      /** `dense` means the rows were closed up to make it fit. Say so. */
      readonly rows: 'default' | 'dense';
    }
  | { readonly kind: 'refused'; readonly reason: BuildRefusal };

function shapeOf(choices: SheetChoices, bubble: BubbleMetrics): Omit<SheetSpecInput, 'paper'> {
  const symbols = ALPHABET[choices.alphabet]().slice(0, choices.choices);
  return {
    templateId: choices.templateId,
    version: 4,
    name: choices.name,
    branding: choices.branding,
    columns: 'auto',
    questions: Array.from({ length: choices.questions }, () => ({
      kind: 'choice' as const,
      symbols: [...symbols],
      placement: choices.placement,
      select: choices.select,
    })),
    headerFields: [
      {
        id: 'studentName',
        usage: 'studentName' as const,
        label: choices.labels.studentName,
        kind: 'writtenBox' as const,
        width: 'large' as const,
      },
      ...(choices.studentId > 0
        ? [
            {
              id: 'studentId',
              usage: 'studentId' as const,
              label: choices.labels.studentId,
              kind: 'bubbleGrid' as const,
              length: choices.studentId,
              symbols: [...digitSymbols()],
            },
          ]
        : []),
      ...(choices.keyVersions > 0
        ? [
            {
              id: 'keyVersion',
              usage: 'keyVersion' as const,
              label: choices.labels.keyVersion,
              kind: 'bubbleGrid' as const,
              length: 1,
              symbols: [...latinSymbols(choices.keyVersions)],
            },
          ]
        : []),
    ],
    bubble,
  };
}

/** Why the largest paper in the family refused, so a refusal carries numbers. */
function overflowOn(shape: Omit<SheetSpecInput, 'paper'>, family: PaperFamily): BuildRefusal {
  // Every family is a non empty tuple in `paper.ts`, so the last entry is a
  // paper and the compiler knows it. A guard here would be unreachable code.
  const papers = PAPER_FAMILIES[family];
  const largest = papers[papers.length - 1] ?? papers[0];

  const parsed = SheetSpecSchema.safeParse({ ...shape, paper: largest });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      kind: 'rejected',
      field: (first?.path ?? []).join('.'),
      why: first?.message ?? 'invalid',
    };
  }
  const result = layoutSheet(parsed.data);
  if (result.kind === 'ok') {
    // Unreachable while `smallestPaper` and `layoutSheet` agree, and reported
    // rather than asserted because a disagreement between them is a real bug
    // and silence about it would be the worst of the three outcomes.
    return { kind: 'rejected', field: 'paper', why: 'the largest paper fits after all' };
  }
  return {
    kind: 'does-not-fit',
    paper: largest,
    area: result.area,
    axis: result.axis,
    neededMm: result.neededMm,
    availableMm: result.availableMm,
  };
}

/**
 * A teacher's choices as a sheet, or a named refusal.
 *
 * The order matters: the cheap bounds are checked before any layout runs, so a
 * teacher who asked for three hundred questions is told that rather than made
 * to wait while six papers are measured against a shape that cannot exist.
 */
export function buildSheet(choices: SheetChoices): BuildResult {
  const refuse = (reason: BuildRefusal): BuildResult => ({ kind: 'refused', reason });

  if (
    !Number.isInteger(choices.questions) ||
    choices.questions < QUESTION_RANGE.min ||
    choices.questions > QUESTION_RANGE.max
  ) {
    return refuse({ kind: 'questions-out-of-range', asked: choices.questions });
  }
  if (
    !Number.isInteger(choices.choices) ||
    choices.choices < CHOICE_RANGE.min ||
    choices.choices > CHOICE_RANGE.max
  ) {
    return refuse({ kind: 'choices-out-of-range', asked: choices.choices });
  }

  // Asked for six options from true and false. A separate refusal from the one
  // above because the fix is different: pick another alphabet, not another
  // number.
  const available = ALPHABET[choices.alphabet]().length;
  if (choices.choices > available) {
    return refuse({
      kind: 'alphabet-too-small',
      alphabet: choices.alphabet,
      asked: choices.choices,
      available,
    });
  }

  if (
    !Number.isInteger(choices.studentId) ||
    choices.studentId < 0 ||
    choices.studentId > GRID_RANGE.max
  ) {
    return refuse({ kind: 'student-id-out-of-range', asked: choices.studentId });
  }
  // Zero is none. One is not a version, it is a sheet with a box that can only
  // say one thing, so it is refused rather than silently printed.
  if (
    !Number.isInteger(choices.keyVersions) ||
    choices.keyVersions < 0 ||
    choices.keyVersions === 1 ||
    choices.keyVersions > MAX_SYMBOLS
  ) {
    return refuse({ kind: 'key-versions-out-of-range', asked: choices.keyVersions });
  }

  for (const rows of ['default', 'dense'] as const) {
    const shape = shapeOf(choices, rows === 'default' ? DEFAULT_BUBBLE : DENSE_ROWS);
    const picked = smallestPaper(shape, choices.family);
    if (picked !== null) {
      const parsed = SheetSpecSchema.safeParse({ ...shape, paper: picked.paper });
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return refuse({
          kind: 'rejected',
          field: (first?.path ?? []).join('.'),
          why: first?.message ?? 'invalid',
        });
      }
      return { kind: 'ok', spec: parsed.data, paper: picked.paper, fill: picked.fill, rows };
    }
  }

  return refuse(overflowOn(shapeOf(choices, DENSE_ROWS), choices.family));
}
