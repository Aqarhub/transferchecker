// Geometry produced by the layout engine. Every coordinate is in millimeters
// from the top-left corner of the page.

import type { QrMatrix } from './code/matrix';

export interface Point {
  readonly xMm: number;
  readonly yMm: number;
}

export interface Rect {
  readonly xMm: number;
  readonly yMm: number;
  readonly wMm: number;
  readonly hMm: number;
}

/**
 * A single bubble. It carries the symbol it stands for, which is what lets the
 * scanner report an answer without knowing which kind of field it came from.
 */
export interface Bubble {
  readonly cxMm: number;
  readonly cyMm: number;
  readonly rMm: number;
  readonly symbol: string;
}

/**
 * A set of bubbles of which at most one may be filled: one question, or one
 * character column of a grid field. This is the unit the scanner scores.
 */
export interface BubbleGroup {
  readonly id: string;
  readonly bubbles: readonly Bubble[];
}

export interface ChoiceLabel {
  /** Centre of the slot the symbol is printed in, on the row's centre line. */
  readonly anchor: Point;
  readonly symbol: string;
}

export interface QuestionRow {
  /** One-based question number as printed on the sheet. */
  readonly question: number;
  /** Right-aligned anchor for the printed question number. */
  readonly numberAnchor: Point;
  readonly bubbles: readonly Bubble[];
  /** Where each choice letter goes when it sits beside its bubble. */
  readonly choiceLabels: readonly ChoiceLabel[];
  /**
   * Whether each bubble is printed with its own symbol inside it. False when
   * the letters live above the column or beside the bubbles, in which case the
   * bubbles print empty. Stated rather than inferred from the other two fields,
   * because a renderer guessing this wrong prints a letter twice or not at all.
   */
  readonly symbolsInBubbles: boolean;
}

/**
 * A row of choice letters printed above a run of questions that share them.
 *
 * It repeats every so many rows rather than appearing once at the top, so a
 * long column gives the eye somewhere to rest and a student counting down forty
 * rows can always see which letter a column of bubbles is.
 */
export interface ChoiceHeader {
  readonly labels: readonly ChoiceLabel[];
  /** Index of the first row this header sits above, within its column. */
  readonly firstRow: number;
}

export interface QuestionColumn {
  readonly index: number;
  /** Empty unless the column's questions print their letters above them. */
  readonly headers: readonly ChoiceHeader[];
  readonly rows: readonly QuestionRow[];
}

export interface WrittenBoxLayout {
  readonly id: string;
  readonly label: string;
  readonly labelAnchor: Point;
  readonly box: Rect;
}

export interface GridFieldColumn {
  readonly index: number;
  readonly bubbles: readonly Bubble[];
}

export interface GridFieldLayout {
  readonly id: string;
  readonly label: string;
  readonly labelAnchor: Point;
  /** Outer frame drawn around the whole grid. */
  readonly frame: Rect;
  /** Empty boxes above the grid where the student may also write the value. */
  readonly writeBoxes: readonly Rect[];
  readonly columns: readonly GridFieldColumn[];
}

/**
 * A short printed line. Layout owns the anchor and the alignment; the renderer
 * owns typography, so the exact baseline is resolved from font metrics there.
 */
export interface AnchoredText {
  readonly text: string;
  readonly anchor: Point;
  readonly align: 'start' | 'center' | 'end';
}

/**
 * The printed code and where it sits. The modules come with the layout rather
 * than from the renderer, because how many modules there are decides how large
 * the code prints, and that moves the header. Geometry keeps one owner.
 */
export interface SheetCodeLayout {
  readonly box: Rect;
  readonly modules: QrMatrix;
  /** The text the modules carry, so a caller can check a decode against it. */
  readonly payload: string;
}

export interface SheetLayout {
  readonly version: 5;
  readonly paper: { readonly widthMm: number; readonly heightMm: number };
  /** Perspective reference points, in top-left, top-right, bottom-left, bottom-right order. */
  readonly fiducials: readonly Rect[];
  /**
   * The four small squares at the middle of each page edge, in left, right,
   * top, bottom order. Four corner points fix a homography exactly and say
   * nothing about the middle of the page; these are the sheet's only evidence
   * there, in both axes, and they replace version 4's per-row timing strip and
   * anchor columns.
   */
  readonly edgeMarks: readonly Rect[];
  /**
   * The institution letterhead band, or null when this sheet prints none.
   * The band itself is blank paper: the school stamps or prints its own
   * header there, so the renderer draws nothing in it.
   */
  readonly letterhead: Rect | null;
  readonly code: SheetCodeLayout;
  /** The site name, printed beside the code at the foot of the sheet. */
  readonly branding: AnchoredText;
  /** The template name, printed under the smallest header box. */
  readonly title: AnchoredText;
  readonly writtenFields: readonly WrittenBoxLayout[];
  readonly gridFields: readonly GridFieldLayout[];
  readonly questionColumns: readonly QuestionColumn[];
  readonly warningAnchor: Point;
}

/** Which region could not accommodate the requested configuration. */
export type OverflowArea = 'questions' | 'sidebar' | 'code';

/**
 * Layout never throws for a configuration a teacher could plausibly request.
 * An impossible combination is data the caller renders as guidance, not an
 * exception, so the UI can explain exactly what did not fit.
 */
export type LayoutResult =
  | { readonly kind: 'ok'; readonly layout: SheetLayout }
  | {
      readonly kind: 'overflow';
      readonly area: OverflowArea;
      readonly axis: 'width' | 'height';
      readonly neededMm: number;
      readonly availableMm: number;
    };
