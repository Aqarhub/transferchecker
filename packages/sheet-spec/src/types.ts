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
  /**
   * Where each choice letter is printed when it sits beside its bubble. Empty
   * for internal placement, where the symbol is drawn inside the bubble.
   */
  readonly choiceLabels: readonly ChoiceLabel[];
}

export interface QuestionColumn {
  readonly index: number;
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

export interface VerticalText {
  readonly text: string;
  /**
   * Band the text is centered within. Layout owns geometry and the renderer
   * owns typography, so the exact baseline is resolved from font metrics there.
   */
  readonly band: Rect;
  readonly rotationDeg: number;
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
  readonly version: 3;
  readonly paper: { readonly widthMm: number; readonly heightMm: number };
  /** Perspective reference points, in top-left, top-right, bottom-left, bottom-right order. */
  readonly fiducials: readonly Rect[];
  /** One mark per question row, used to recover the row index after warping. */
  readonly timingMarks: readonly Rect[];
  readonly code: SheetCodeLayout;
  readonly branding: VerticalText;
  readonly title: VerticalText;
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
