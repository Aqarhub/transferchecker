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

export const PAPER_NAMES = ['A4', 'LETTER'] as const;

export type PaperName = (typeof PAPER_NAMES)[number];

export interface PaperSize {
  readonly widthMm: number;
  readonly heightMm: number;
}

export const PAPER: Readonly<Record<PaperName, PaperSize>> = {
  A4: { widthMm: 210, heightMm: 297 },
  LETTER: { widthMm: 216, heightMm: 279 },
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
  /** Square QR code carrying the template identity. */
  qrSizeMm: 16,
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
  /** Space a choice letter needs when it sits beside its bubble. */
  externalLabelMm: 3.2,
  /** Gap after an external label's bubble, before the next choice. */
  externalGapMm: 2.2,
} as const;

/** Handwriting box widths, named rather than left as free millimetres. */
export const FIELD_WIDTH_MM = {
  small: 32,
  medium: 52,
  large: 76,
} as const;
