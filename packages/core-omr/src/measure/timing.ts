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
    }
  | { readonly kind: 'missing'; readonly expected: number; readonly found: number }
  | { readonly kind: 'unstable'; readonly residualMm: number };

/**
 * How far a mark's measured centre may sit from its predicted one before the
 * sheet is not the geometry it claims.
 *
 * A pixel is about 0.21 mm at the resolution the code needs, and a 4 mm tall
 * mark's centre measures to about a fifth of a millimetre, so half a millimetre
 * of root mean square error is a little over two pixels: comfortably measurable
 * and far below the 2.8 mm that a one row shift would show as at the default
 * row pitch.
 */
export const MAX_RESIDUAL_MM = 0.5;

/** How far along the search runs from a mark's predicted centre. */
const SEARCH_SPAN = 0.75;

/**
 * The mark's centre in y, measured as the centre of mass of its ink.
 *
 * The strip is inset from both ends of the printed mark, because the sheet
 * leaves no clearance between the timing band and the branding band beside it,
 * and reading the whole width would let that ink into the measurement.
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
 * Reads every timing mark the layout says is printed.
 *
 * Matching is by predicted position with a gate, never by order. Order matching
 * is what turns one mark hidden under a pen stroke into a whole sheet renumbered
 * by one row, which reads as a perfectly consistent paper with the wrong grade.
 */
export function readTimingMarks(image: GrayImage, frame: Frame, layout: SheetLayout): TimingRead {
  const expected = layout.timingMarks;
  if (expected.length === 0) return { kind: 'ok', marks: [], residualMm: 0 };

  const first = expected[0];
  const second = expected[1];
  const pitchMm =
    first !== undefined && second !== undefined
      ? second.yMm - first.yMm
      : GEOMETRY.timingHeightMm * 2;

  const marks: RowMark[] = [];
  for (const [row, rect] of expected.entries()) {
    const found = measureMark(image, frame, rect, pitchMm);
    if (found === null) continue;
    marks.push({
      row,
      predictedYMm: rect.yMm + rect.hMm / 2,
      yMm: found.yMm,
      xMm: found.xMm,
    });
  }

  // Every mark, or a named refusal. A sheet missing one of them is a sheet we
  // cannot number the rows of, and guessing is the failure this whole file
  // exists to prevent.
  if (marks.length !== expected.length) {
    return { kind: 'missing', expected: expected.length, found: marks.length };
  }

  const residualMm = Math.sqrt(
    marks.reduce((sum, mark) => sum + (mark.yMm - mark.predictedYMm) ** 2, 0) / marks.length,
  );
  if (residualMm > MAX_RESIDUAL_MM) return { kind: 'unstable', residualMm };
  return { kind: 'ok', marks, residualMm };
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
