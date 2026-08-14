// Physical page geometry for generated answer sheets.
//
// Units are millimeters everywhere. The origin is the top-left corner of the
// page, x grows to the right and y grows downward. This matches both the print
// coordinate space used by the PDF generator and the orientation of a scanned
// frame after perspective correction, so a single set of numbers serves both.
//
// IMPORTANT: these constants are part of the printed artifact. A sheet printed
// today must still scan correctly years later, so any change here is a breaking
// change and requires bumping SheetSpec.version.

// Order is part of the printed code, so names are only ever appended.
export const PAPER_NAMES = ['A4', 'LETTER', 'A5', 'A6', 'HALF_LETTER', 'QUARTER_LETTER'] as const;

export type PaperName = (typeof PAPER_NAMES)[number];

export interface PaperSize {
  readonly widthMm: number;
  readonly heightMm: number;
}

/**
 * The small sizes exist so that several sheets fit one printed page **without
 * being scaled**. Scaling a sheet down would shrink the bubbles and the corner
 * squares with it, and the scanner works in millimetres, so a shrunk sheet is
 * an unreadable sheet. A half page sheet is therefore designed at half page
 * size and tiled at its true size.
 */
export const PAPER: Readonly<Record<PaperName, PaperSize>> = {
  A4: { widthMm: 210, heightMm: 297 },
  LETTER: { widthMm: 216, heightMm: 279 },
  A5: { widthMm: 148, heightMm: 210 },
  A6: { widthMm: 105, heightMm: 148 },
  HALF_LETTER: { widthMm: 139, heightMm: 216 },
  QUARTER_LETTER: { widthMm: 108, heightMm: 139 },
};

/** Fixed bands, marks and paddings shared by every sheet. */
export const GEOMETRY = {
  /** Distance from the paper edge to the corner fiducials. */
  marginMm: 6,
  /** Side length of each of the four square corner fiducials. */
  fiducialMm: 8,
  /** Timing mark drawn on the left edge, one per question row. */
  timingWidthMm: 6,
  timingHeightMm: 3,
  /** Vertical text band reserved for the site name on the left edge. */
  brandingBandMm: 8,
  /** Vertical text band reserved for the template name on the right edge. */
  titleBandMm: 8,
  /**
   * Smallest a printed code module may be. Below this a phone camera at normal
   * distance stops resolving modules, which is a scan that fails rather than a
   * scan that is merely slower. The code's printed size follows from this and
   * from how much it carries, so a sheet never spends more paper than its own
   * payload needs.
   */
  codeModuleMm: 0.5,
  /** Quiet zone the QR specification requires, in modules, on each side. */
  codeQuietModules: 4,
  /** Past this the code would eat the header, so the sheet is refused instead. */
  codeMaxSizeMm: 30,
  /** Vertical space between the fiducial row and the header band. */
  headerGapMm: 4,
  /** Height reserved above a written box for its printed label. */
  headerLabelMm: 4.5,
  /** Height of a handwriting box in the header band. */
  writtenBoxHeightMm: 10,
  /** Horizontal and vertical spacing between header fields. */
  headerFieldGapMm: 6,
  headerRowGapMm: 4,
  /** Vertical space between the header band and the question grid. */
  gridGapMm: 6,
  /** Space left of the first bubble of a row for the question number. */
  numberGutterMm: 8,
  /** Horizontal space between question columns. */
  columnGapMm: 6,
  /**
   * How far apart rows may be pushed when the questions do not fill the page.
   * `bubble.pitchYMm` is the closest rows may sit; the grid then spreads to use
   * the height it was given, because a sheet with its questions crammed at the
   * top and the bottom half blank reads as a mistake. This caps the spreading,
   * so three questions on a page do not end up a finger apart.
   */
  maxRowPitchMm: 12,
  /** Horizontal space between the question grid and the sidebar. */
  sidebarGapMm: 8,
  /** Height reserved above a sidebar grid for its printed label. */
  sidebarLabelMm: 5,
  /** Padding inside the frame drawn around a sidebar grid. */
  sidebarPadMm: 3,
  /** Height of the write-in boxes drawn above a sidebar grid. */
  sidebarWriteBoxMm: 8,
  /** Vertical space between two stacked sidebar grids. */
  sidebarStackGapMm: 6,
  /** Band at the bottom of the page reserved for the print warning. */
  warningBandMm: 12,
  /** Height of a row of choice letters printed above its column. */
  choiceHeaderMm: 4,
  /**
   * Rows between one header row and the next. Ten is the count a student
   * counts in, so the header lands where the eye already pauses.
   */
  headerEveryRows: 10,
  /** Space a choice letter needs when it sits beside its bubble. */
  externalLabelMm: 3.2,
  /** Gap after an external label's bubble, before the next choice. */
  externalGapMm: 2.2,
} as const;

/**
 * Paper sizes from smallest to largest, within one family. A sheet takes the
 * smallest size its questions fit on, so a twenty question quiz is a small
 * sheet and a hundred question exam is a full page, rather than every sheet
 * being a full page with the bottom half empty.
 */
export const PAPER_FAMILIES = {
  A: ['A6', 'A5', 'A4'],
  LETTER: ['QUARTER_LETTER', 'HALF_LETTER', 'LETTER'],
} as const satisfies Readonly<Record<string, readonly PaperName[]>>;

export type PaperFamily = keyof typeof PAPER_FAMILIES;

/** Handwriting box widths, named rather than left as free millimetres. */
export const FIELD_WIDTH_MM = {
  small: 32,
  medium: 52,
  large: 76,
} as const;
