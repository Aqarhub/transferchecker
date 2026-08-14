// Print appearance of a generated sheet.
//
// These are print values, not interface values. A bubble outline has to be
// light enough that the paper reads as blank to the scanner, yet dark enough
// for a student to aim at, so it is tuned for toner rather than for a screen.

export interface SheetTheme {
  readonly ink: string;
  readonly bubbleStroke: string;
  readonly bubbleStrokeMm: number;
  readonly bubbleLabel: string;
  readonly bubbleLabelMm: number;
  /** A choice letter printed beside its bubble instead of inside it. */
  readonly choiceLabel: string;
  readonly choiceLabelMm: number;
  readonly frameStroke: string;
  readonly frameStrokeMm: number;
  readonly boxStroke: string;
  readonly boxStrokeMm: number;
  readonly labelSizeMm: number;
  readonly questionSizeMm: number;
  readonly bandSizeMm: number;
  readonly warningSizeMm: number;
}

export const DEFAULT_THEME: SheetTheme = {
  ink: '#000000',
  bubbleStroke: '#8c9196',
  bubbleStrokeMm: 0.25,
  bubbleLabel: '#8c9196',
  bubbleLabelMm: 1.9,
  // Darker than a letter inside a bubble. A letter inside has to stay faint so
  // the scanner still reads the bubble as blank, while one printed beside it is
  // outside every sampled area, so it can be as legible as the page allows.
  choiceLabel: '#3d4348',
  choiceLabelMm: 2.3,
  frameStroke: '#000000',
  frameStrokeMm: 0.3,
  boxStroke: '#000000',
  boxStrokeMm: 0.35,
  labelSizeMm: 2.6,
  questionSizeMm: 2.8,
  bandSizeMm: 3.2,
  warningSizeMm: 2.4,
};
