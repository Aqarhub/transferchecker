// Reading the timing marks, which the sheet has always printed and nothing has
// ever read.
//
// Defense د12. Section 3 of the plan promises the marks fix the row number even
// when the print has shifted, and the pipeline in section 4 goes from the corner
// squares straight to the specification's coordinates without touching them. So
// the promise is on the paper and absent from the engine.
//
// One reading, three uses:
//
// 1. Registration. Each row is placed from its own mark rather than from
//    interpolation between the corners alone.
// 2. Proof of the geometry. Four corner points fix all eight degrees of freedom
//    of a homography exactly, so the corners can NEVER disprove it: a sheet
//    printed on the wrong paper still solves perfectly against its own four
//    corners. The marks are the only evidence in the middle of the page, which
//    is where a curled sheet, a stretched feed and a wrong paper size do their
//    damage.
// 3. Counting. The count is known from the specification, so "expected 40, found
//    39" is a named refusal instead of a silent renumbering of every row below.
//    A one row shift does not damage a grade, it invents a whole paper with
//    complete confidence.

import { GEOMETRY } from '@transferchecker/sheet-spec';
import type { Rect, SheetLayout } from '@transferchecker/sheet-spec';
import type { Frame } from '../geometry/frame';
import { toImage } from '../geometry/frame';
import { sampleAt } from '../image/gray';
import type { GrayImage } from '../image/gray';

export interface RowMark {
  /** Index of the row this mark belongs to, from the layout. */
  readonly row: number;
  /** Where the mark was predicted, and where it was actually found. */
  readonly predictedYMm: number;
  readonly yMm: number;
  readonly xMm: number;
}

export type TimingRead =
  | {
      readonly kind: 'ok';
      readonly marks: readonly RowMark[];
      /** Root mean square of predicted against measured centres, in millimetres. */
      readonly residualMm: number;
      /** How many of the expected marks were found where they were predicted. */
      readonly found: number;
      readonly expected: number;
    }
  | { readonly kind: 'missing'; readonly expected: number; readonly found: number }
  | { readonly kind: 'unstable'; readonly residualMm: number };

/**
 * How far ONE mark's measured centre may sit from its predicted one before that
 * is not that mark.
 *
 * A pixel is about 0.21 mm at the resolution the code needs and a 4 mm tall
 * mark's centre measures to about a fifth of a millimetre, so half a millimetre
 * is a little over two pixels: comfortably measurable. [measured] On every
 * frame the engine is required to accept, flat renders and photographs at 1080p
 * and 1440p with tilt, blur, noise and a shadow, the worst single mark lands
 * between 0.006 mm and 0.038 mm, so this gate is two orders of magnitude above
 * anything legitimate.
 */
export const MAX_RESIDUAL_MM = 0.5;

/**
 * And how far the whole set may sit, which is a much tighter number, because a
 * root mean square divides one bad row by the square root of the count.
 *
 * [measured] On `full100` with 34 marks, ONE mark printed 3.0 mm out of place
 * gives an RMS of 0.486 mm, which passed the old 0.5 mm gate, and the engine
 * then applied it: `rowCorrectionMm` pulled that row's whole sample lattice
 * 2.613 mm off its bubbles, which is 1.7 disc radii, and the row came back
 * blank with a wide margin and no warning. The RMS gate alone cannot see a
 * single bad row, which is exactly the failure the marks exist to catch, so
 * there are now two gates: this one over the set, and MAX_RESIDUAL_MM over each
 * mark on its own.
 */
export const MAX_RESIDUAL_RMS_MM = 0.25;

/**
 * How much of the strip may be unreadable before the sheet is refused.
 *
 * Acceptance criterion 15 requires the row numbering to survive up to a fifth
 * of the marks being occluded, and a pen line down the left margin is a named
 * failure mode, so refusing at one missing mark out of thirty four failed a
 * criterion outright. A row whose own mark is gone takes its correction from
 * the marks above and below it instead.
 */
const MAX_MISSING_FRACTION = 0.2;

/**
 * But never more than two rows in a row. Interpolation across a longer gap is
 * not a measurement of anything, it is a straight line drawn through the region
 * where the sheet is least trustworthy.
 */
const MAX_CONSECUTIVE_MISSING = 2;

/**
 * How far along the search runs from a mark's predicted centre.
 *
 * Bounded below by the neighbouring mark rather than by this fraction alone.
 * [computed] At the schema's tightest row pitch of 5.5 mm with defense د3's
 * 4 mm mark, three quarters of the pitch is 4.13 mm while the neighbour's near
 * edge is at 3.50 mm, so the fraction on its own would open the window onto the
 * next mark and let its ink pull this one's centre of mass. The window stops at
 * `pitch - height / 2` for that reason, and a mark that has moved further than
 * MAX_RESIDUAL_MM is discarded rather than believed, so the two rules together
 * make it impossible for a neighbour to be read as this mark.
 */
const SEARCH_SPAN = 0.75;

/**
 * The mark's centre in y, measured as the centre of mass of its ink.
 *
 * The strip is inset from both ends of the printed mark. Defense د3 has since
 * given the marks 4 mm of blank paper beside them, so this no longer defends
 * against the branding band it was written for, but it still keeps the
 * measurement off the mark's own printed edges, where toner spread and the
 * camera's blur live.
 */
function measureMark(
  image: GrayImage,
  frame: Frame,
  rect: Rect,
  pitchMm: number,
): { yMm: number; xMm: number } | null {
  const centreXMm = rect.xMm + rect.wMm / 2;
  const insetXMm = rect.wMm * 0.25;
  const halfSpanMm = Math.min(pitchMm * SEARCH_SPAN, pitchMm - rect.hMm / 2);
  const predicted = rect.yMm + rect.hMm / 2;

  const values: { yMm: number; value: number }[] = [];
  let low = 255;
  let high = 0;
  for (let yMm = predicted - halfSpanMm; yMm <= predicted + halfSpanMm; yMm += 0.1) {
    let sum = 0;
    let count = 0;
    for (let xMm = rect.xMm + insetXMm; xMm <= rect.xMm + rect.wMm - insetXMm; xMm += 0.25) {
      const at = toImage(frame, xMm, yMm);
      if (at.x < 0 || at.y < 0 || at.x > image.width - 1 || at.y > image.height - 1) continue;
      sum += sampleAt(image, at.x, at.y);
      count += 1;
    }
    if (count === 0) continue;
    const value = sum / count;
    if (value < low) low = value;
    if (value > high) high = value;
    values.push({ yMm, value });
  }

  if (values.length === 0 || high - low < 30) return null;

  // Weight by how dark each line is relative to the strip's own range, so the
  // centre of mass follows the printed mark and not the paper around it.
  const cut = (low + high) / 2;
  let weight = 0;
  let sum = 0;
  for (const entry of values) {
    if (entry.value >= cut) continue;
    const w = cut - entry.value;
    weight += w;
    sum += w * entry.yMm;
  }
  return weight <= 0 ? null : { yMm: sum / weight, xMm: centreXMm };
}

/**
 * Reads the timing marks the layout says are printed.
 *
 * Matching is by predicted position with a gate, never by order. Order matching
 * is what turns one mark hidden under a pen stroke into a whole sheet renumbered
 * by one row, which reads as a perfectly consistent paper with the wrong grade.
 *
 * A mark may be missing without the sheet being refused, up to a fifth of them
 * and never three together, because a pen line down the margin is an ordinary
 * accident and acceptance criterion 15 asks for exactly that tolerance. What is
 * NOT tolerated is believing a mark that is not where it should be.
 */
export function readTimingMarks(image: GrayImage, frame: Frame, layout: SheetLayout): TimingRead {
  const expected = layout.timingMarks;
  if (expected.length === 0) {
    return { kind: 'ok', marks: [], residualMm: 0, found: 0, expected: 0 };
  }

  const first = expected[0];
  const second = expected[1];
  const pitchMm =
    first !== undefined && second !== undefined
      ? second.yMm - first.yMm
      : GEOMETRY.timingHeightMm * 2;

  const marks: RowMark[] = [];
  let gap = 0;
  let longestGap = 0;
  for (const [row, rect] of expected.entries()) {
    const predictedYMm = rect.yMm + rect.hMm / 2;
    const found = measureMark(image, frame, rect, pitchMm);
    // A mark measured further out than one mark may be is not that mark: it is
    // a pen stroke, a blot, or the neighbouring mark reached by a search window
    // that opened too wide. It is dropped rather than believed, and its row is
    // then registered from the marks above and below it.
    if (found === null || Math.abs(found.yMm - predictedYMm) > MAX_RESIDUAL_MM) {
      gap += 1;
      longestGap = Math.max(longestGap, gap);
      continue;
    }
    gap = 0;
    marks.push({ row, predictedYMm, yMm: found.yMm, xMm: found.xMm });
  }

  // A fifth of the strip may be gone, but never three rows together, and a
  // sheet under either bound is one we cannot number the rows of. Guessing is
  // the failure this whole file exists to prevent.
  const missing = expected.length - marks.length;
  if (
    missing > Math.floor(expected.length * MAX_MISSING_FRACTION) ||
    longestGap > MAX_CONSECUTIVE_MISSING
  ) {
    return { kind: 'missing', expected: expected.length, found: marks.length };
  }

  const residualMm = Math.sqrt(
    marks.reduce((sum, mark) => sum + (mark.yMm - mark.predictedYMm) ** 2, 0) / marks.length,
  );
  if (residualMm > MAX_RESIDUAL_RMS_MM) return { kind: 'unstable', residualMm };
  return { kind: 'ok', marks, residualMm, found: marks.length, expected: expected.length };
}

/**
 * The y correction to apply at a given point, interpolated between the two
 * nearest marks. This is registration: a row is placed from its own mark.
 */
export function rowCorrectionMm(marks: readonly RowMark[], yMm: number): number {
  if (marks.length === 0) return 0;
  const first = marks[0];
  const last = marks.at(-1);
  if (first === undefined || last === undefined) return 0;
  if (yMm <= first.predictedYMm) return first.yMm - first.predictedYMm;
  if (yMm >= last.predictedYMm) return last.yMm - last.predictedYMm;

  for (let index = 1; index < marks.length; index += 1) {
    const above = marks[index - 1];
    const below = marks[index];
    if (above === undefined || below === undefined) continue;
    if (yMm > below.predictedYMm) continue;
    const span = below.predictedYMm - above.predictedYMm;
    if (span <= 0) return above.yMm - above.predictedYMm;
    const t = (yMm - above.predictedYMm) / span;
    const start = above.yMm - above.predictedYMm;
    const end = below.yMm - below.predictedYMm;
    return start + (end - start) * t;
  }
  return last.yMm - last.predictedYMm;
}
