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
   * positions out of the paper size the printed code carries. Since version 5
   * the top margin only applies when the sheet prints no letterhead band: with
   * one, the corner row sits below the band instead, see `letterheadOf`.
   */
  marginTopMm: 10,
  marginSideMm: 10,
  marginBottomMm: 18,
  /**
   * Side length of each of the four square corner fiducials.
   *
   * Six since version 5, eight before it. [computed] On a 1080 px frame of an
   * A4 page a 6 mm square is about 31 px per side, several times what a centre
   * of mass needs, and the change is proven against the full golden sweep
   * rather than assumed.
   */
  fiducialMm: 6,
  /**
   * Side of the four small squares printed at the middle of each page edge,
   * new in version 5.
   *
   * They replace both the per-row timing strip and the anchor columns of
   * version 4. Four corner points fix a homography exactly and say nothing
   * about the middle of the page, which is where a curled sheet does its
   * damage: a curl about a vertical axis moves the edge midpoints in x, one
   * about a horizontal axis moves them in y, and these four marks measure both
   * where nothing else on the sheet can. Every camera-phone competitor
   * (ZipGrade, Akindi, GradeCam) registers this way rather than with per-row
   * marks, which belong to sheet-fed scanners.
   */
  edgeMarkMm: 4,
  /**
   * Blank paper an edge mark needs on each side before any printed ink, so its
   * measurement window never opens onto something else's ink.
   */
  edgeMarkClearMm: 4,
  /**
   * The institution letterhead band, version 5: blank space above the top
   * corner squares where a school prints or stamps its own header, the way
   * ministry exam papers carry one. Heights by paper class are in
   * `letterheadOf`; this is the gap between the paper edge and the band.
   */
  letterheadTopMm: 5,
  /** Blank paper between the letterhead band and the top corner squares. */
  letterheadClearMm: 5,
  /**
   * White gap inserted after every so many question rows, version 5. The count
   * itself is `groupEvery` on the spec (default ten); this is the gap's
   * height. Ten is the count a student counts in, and the break is what keeps
   * a long column from reading as one undifferentiated stack.
   *
   * Four rather than five because of one sheet: a hundred dense rows plus two
   * gaps at five millimetres run 0.5 mm past an A4 body, and a constant that
   * fails exactly one member of the family is the wrong constant.
   */
  groupGapMm: 4,
  /** Blank paper between the printed code's bottom edge and the corner row. */
  codeBottomClearMm: 4,
  /** Gap between the printed code and the site name printed beside it. */
  brandGapMm: 4,
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
  /**
   * Past this the code is refused rather than printed.
   *
   * Twenty-four since version 5, thirty before it. The code moved from the
   * header to the foot of the sheet, where its height is what the question
   * columns and the identity stack pay for row by row: at thirty, the hundred
   * question sheet loses its thirtieth row and the family's approved 30+30+30+10
   * split with it. [computed] Every stock payload still fits with the module
   * above its 0.5 mm floor; what shrinks is the ceiling for exotic custom
   * payloads, which are refused loudly at design time exactly as they were at
   * thirty, just a little sooner.
   */
  codeMaxSizeMm: 24,
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
   * Since version 5 the gaps no longer carry anchor marks, so their width is
   * a reading decision rather than a measuring one: wide enough that the
   * columns read as separate blocks, and no wider, because [measured] at
   * twelve an A6 sheet is 0.6 mm short of holding two four-choice columns.
   * The whole block of columns is centred on the page.
   */
  columnGapMm: 10,
  /**
   * How far apart rows may be pushed when the questions do not fill the page.
   * `bubble.pitchYMm` is the closest rows may sit; the grid then spreads to use
   * the height it was given, because a sheet with its questions crammed at the
   * top and the bottom half blank reads as a mistake. This caps the spreading,
   * so three questions on a page do not end up a finger apart.
   */
  maxRowPitchMm: 12,
  /** Height reserved above a sidebar grid for its printed label. */
  sidebarLabelMm: 5,
  /** Padding inside the frame drawn around a sidebar grid. */
  sidebarPadMm: 2.5,
  /** Height of the write-in boxes drawn above a sidebar grid. */
  sidebarWriteBoxMm: 7,
  /** Vertical space between two stacked sidebar grids. */
  sidebarStackGapMm: 6,
  /** Gap between the tail question column and the identity stack under it. */
  sidebarTailGapMm: 3,
  /** Blank paper between the identity stack's bottom and the printed code's top edge. */
  sidebarBottomClearMm: 2.5,
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
 * Height of the institution letterhead band a paper gets, when the sheet asks
 * for one at all.
 *
 * A logic and not a constant, which was measured the hard way: a quarter page
 * sheet is 139 mm tall and giving it a 24 mm band eats a fifth of it, so the
 * band scales with the paper class and disappears on the small sizes that are
 * tiled several to a printed page, where per-sheet letterheads would print an
 * institution's header four times on one page.
 */
export function letterheadBandMm(paper: PaperSize): number {
  if (paper.heightMm >= 260) return 24;
  if (paper.heightMm >= 200) return 18;
  return 0;
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
