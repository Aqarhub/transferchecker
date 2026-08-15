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
  /**
   * Distance from the paper edge to the corner fiducials, defense د1.
   *
   * The three are not equal, and they are not meant to be. Desktop printers are
   * quoted at a 6.35 mm unprintable border, and economy ink jets declare a
   * BOTTOM margin of 15 mm to 16.7 mm, so a 6 mm margin put both lower corner
   * squares inside the band the printer never puts ink on: not a degraded scan,
   * a sheet with no corners, repeated across the whole stack.
   *
   * Unequal margins cost nothing, because the perspective solve needs four
   * points at KNOWN positions and not at EQUAL ones, and the scanner reads the
   * positions out of the paper size the printed code carries.
   */
  marginTopMm: 10,
  marginSideMm: 10,
  marginBottomMm: 18,
  /** Side length of each of the four square corner fiducials. */
  fiducialMm: 8,
  /**
   * Timing mark drawn on the left edge, one per question row.
   *
   * Four millimetres rather than three, defense د3: three is under everything
   * the field's literature recommends, and a 3 mm mark is the first thing to
   * clog when the toner runs low or the sheet is a third generation photocopy.
   * The mark is a measuring instrument and not a decoration, so it is given the
   * height that keeps it measurable at the end of its life rather than the
   * height that looks tidy when new.
   */
  timingWidthMm: 6,
  timingHeightMm: 4,
  /**
   * Blank paper beside a timing mark, before any printed ink, defense د3.
   *
   * The sheet used to leave NONE: marks ran from 6 mm to 12 mm and the branding
   * band started at 12 mm exactly, so the mark's own measurement window opened
   * onto the ink beside it. Four millimetres is what moved the branding band to
   * the other edge, and the timing reader no longer has to inset its window to
   * keep that ink out.
   */
  timingClearMm: 4,
  /** Vertical text band reserved for the site name, on the right edge. */
  brandingBandMm: 8,
  /** Vertical text band reserved for the template name on the right edge. */
  titleBandMm: 8,
  /**
   * Smallest a printed code module may be. Below this a phone camera at normal
   * distance stops resolving modules, which is a scan that fails rather than a
   * scan that is merely slower.
   *
   * This is a FLOOR and no longer the printed size: `codeModuleMmFor` grows the
   * module until the code fills its budget. See defense د6.
   */
  codeMinModuleMm: 0.5,
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
  /**
   * Horizontal space between question columns.
   *
   * Eight rather than six because the gap now carries the anchor marks, and a
   * 3 mm mark in a 6 mm gap would have had its measurement window open onto the
   * bubble outline beside it.
   */
  columnGapMm: 8,
  /**
   * Width of an anchor mark, printed in each gap between question columns.
   *
   * This is the only evidence on the sheet for registration in x anywhere
   * between the corner squares. Every timing mark sits at one x inside the left
   * corner square's own band, so a cylindrical curl about a vertical axis, zero
   * at the corners and peaking mid page, solves the four corners exactly, leaves
   * a timing residual of 0.00 mm, and still moves the middle of the page by a
   * whole bubble pitch. The anchor is what makes that measurable.
   *
   * Three millimetres in an 8 mm gap leaves 2.5 mm of blank paper on each side.
   * That is less than `timingClearMm` and it is enough here, because the ink it
   * would meet first is the bubble outline, which is printed light and falls on
   * the paper side of the mark's own black to white cut. The nearest SOLID ink,
   * the printed question number, is 5 mm away.
   */
  anchorWidthMm: 3,
  /**
   * Blank paper an anchor mark needs on each side. Exactly what an anchor gets
   * inside a column gap, which is where the number comes from: it is also the
   * width a band anywhere else on the sheet must have before an anchor is
   * printed in it.
   */
  anchorClearMm: 2.5,
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
 * The printed size of one code module, given how many modules the symbol has.
 *
 * Defense د6. The module used to be pinned at its documented MINIMUM of 0.5 mm
 * against a budget of 30 mm, so a sheet with a small payload printed a fragile
 * code and got nothing back for it: the spare millimetres were spent on white
 * paper around the symbol. Here the module grows until the code fills the
 * budget, which is a third more ink for the printer and zero extra page.
 *
 * It matters more here than it would elsewhere, because the `full` code is what
 * lets a device that has never seen the template grade the paper, so the
 * promise of working with no account and no network hangs on the smallest
 * feature printed on the page.
 *
 * Both sides of the system call THIS function rather than reading a constant:
 * the layout to print the code, and the scanner to derive the module size of
 * each module count it tries. A second implementation of the same arithmetic is
 * how a sheet becomes unreadable by the engine that printed it.
 */
export function codeModuleMmFor(moduleCount: number): number {
  const across = moduleCount + 2 * GEOMETRY.codeQuietModules;
  if (across <= 0) return GEOMETRY.codeMinModuleMm;
  // Rounded down to a hundredth of a millimetre, so both sides land on the same
  // number without depending on floating point equality. A tenth, the unit the
  // rest of the sheet is drawn in, was the first choice and it was measured to
  // be wrong here: at 45 modules across it threw away 4.5 mm of a 30 mm budget,
  // which is a tenth of the module size and the whole point of this function. A
  // printer rasterises at about 0.04 mm, so it can hold a hundredth.
  const fits = Math.floor((GEOMETRY.codeMaxSizeMm / across) * 100) / 100;
  return Math.max(GEOMETRY.codeMinModuleMm, fits);
}

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
