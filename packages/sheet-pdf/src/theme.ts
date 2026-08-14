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
  /** The line the teacher cuts along when a page carries several sheets. */
  readonly cutStroke: string;
  readonly cutStrokeMm: number;
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
  // Pale on purpose. It is a guide for scissors, not content, and half of it
  // survives on the edge of each sheet after the cut.
  cutStroke: '#b0b5ba',
  cutStrokeMm: 0.15,
};

/**
 * How heavily the sheet prints. Office printers vary more than anything else in
 * this pipeline: the same file comes out faint on one and clogged on the next.
 *
 * 'light' is for a printer that lays down too much toner, where a normal
 * outline closes up and the student cannot tell an empty bubble from a filled
 * one. 'dark' is for a printer so faint that the bubbles are hard to aim at.
 *
 * **Only ink changes. No level moves a bubble.** The scanner measures centres
 * and radii, so a teacher can reprint at any darkness and the papers from
 * before and after still grade against the same geometry.
 */
export const DARKNESS_LEVELS = ['light', 'normal', 'dark'] as const;
export type Darkness = (typeof DARKNESS_LEVELS)[number];

const LIGHT: SheetTheme = {
  ...DEFAULT_THEME,
  bubbleStroke: '#b0b5ba',
  bubbleStrokeMm: 0.2,
  bubbleLabel: '#b0b5ba',
  choiceLabel: '#5a6065',
  frameStrokeMm: 0.25,
  boxStrokeMm: 0.28,
};

const DARK: SheetTheme = {
  ...DEFAULT_THEME,
  bubbleStroke: '#6a7176',
  bubbleStrokeMm: 0.32,
  bubbleLabel: '#6a7176',
  choiceLabel: '#22272b',
  frameStrokeMm: 0.4,
  boxStrokeMm: 0.45,
};

const THEMES: Readonly<Record<Darkness, SheetTheme>> = {
  light: LIGHT,
  normal: DEFAULT_THEME,
  dark: DARK,
};

export function themeFor(darkness: Darkness): SheetTheme {
  return THEMES[darkness];
}
