// Placing several sheets on one printed page.
//
// The sheets are tiled at their true size, never scaled. Scaling a sheet to fit
// would shrink its bubbles and corner squares with it, and the scanner measures
// in millimetres, so a scaled sheet is an unreadable one. A half page sheet is
// therefore designed at half page size, and two of them are laid on a page that
// the teacher cuts in two.

import { PAPER } from '@transferchecker/sheet-spec';
import type { PaperName, PaperSize, Point } from '@transferchecker/sheet-spec';

export const COPIES_PER_PAGE = [1, 2, 4] as const;
export type CopiesPerPage = (typeof COPIES_PER_PAGE)[number];

/** Where the teacher cuts. Vertical runs the page's full height, and vice versa. */
export interface CutLine {
  readonly axis: 'vertical' | 'horizontal';
  readonly atMm: number;
}

export interface PagePlan {
  /** The page that goes into the printer. */
  readonly carrier: PaperSize;
  /** Top left corner of each sheet, in page coordinates. */
  readonly origins: readonly Point[];
  readonly cuts: readonly CutLine[];
}

interface Tiling {
  readonly copies: CopiesPerPage;
  readonly columns: number;
  readonly rows: number;
  readonly carrier: PaperSize;
}

const landscape = (paper: PaperSize): PaperSize => ({
  widthMm: paper.heightMm,
  heightMm: paper.widthMm,
});

/**
 * Which sheet sizes tile, and onto what. A full page sheet has no tiling, which
 * is why A4 and LETTER are absent rather than mapped to themselves.
 */
const TILING: Readonly<Partial<Record<PaperName, Tiling>>> = {
  A5: { copies: 2, columns: 2, rows: 1, carrier: landscape(PAPER.A4) },
  A6: { copies: 4, columns: 2, rows: 2, carrier: PAPER.A4 },
  HALF_LETTER: { copies: 2, columns: 2, rows: 1, carrier: landscape(PAPER.LETTER) },
  QUARTER_LETTER: { copies: 4, columns: 2, rows: 2, carrier: PAPER.LETTER },
};

/** The copy counts this sheet size can be printed at. Always includes one. */
export function copiesAvailable(paper: PaperName): readonly CopiesPerPage[] {
  const tiling = TILING[paper];
  return tiling === undefined ? [1] : [1, tiling.copies];
}

/**
 * Spreads `count` tiles of `sizeMm` across `spanMm`, returning where each
 * starts. Whatever the page has left over becomes an even gutter, which is both
 * where the cut goes and the margin for cutting slightly off.
 */
function positions(spanMm: number, sizeMm: number, count: number): number[] {
  const gutterMm = count > 1 ? (spanMm - count * sizeMm) / (count - 1) : 0;
  return Array.from({ length: count }, (_, index) => index * (sizeMm + gutterMm));
}

function cutsBetween(starts: readonly number[], sizeMm: number): number[] {
  return starts.slice(1).map((start, index) => {
    const previousEnd = (starts[index] ?? 0) + sizeMm;
    return (previousEnd + start) / 2;
  });
}

/**
 * Null when this sheet size cannot be printed at this count. The caller offers
 * the counts from `copiesAvailable`, so null means a request that never had a
 * sensible answer rather than a failure to compute one.
 */
export function planPage(paper: PaperName, copies: CopiesPerPage): PagePlan | null {
  const sheet = PAPER[paper];
  if (copies === 1) {
    return { carrier: sheet, origins: [{ xMm: 0, yMm: 0 }], cuts: [] };
  }

  const tiling = TILING[paper];
  if (tiling?.copies !== copies) return null;

  const xs = positions(tiling.carrier.widthMm, sheet.widthMm, tiling.columns);
  const ys = positions(tiling.carrier.heightMm, sheet.heightMm, tiling.rows);

  return {
    carrier: tiling.carrier,
    origins: ys.flatMap((yMm) => xs.map((xMm) => ({ xMm, yMm }))),
    cuts: [
      ...cutsBetween(xs, sheet.widthMm).map((atMm): CutLine => ({ axis: 'vertical', atMm })),
      ...cutsBetween(ys, sheet.heightMm).map((atMm): CutLine => ({ axis: 'horizontal', atMm })),
    ],
  };
}
