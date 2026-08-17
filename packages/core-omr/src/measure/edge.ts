// Reading the four mid-edge marks, the version 5 sheet's only registration
// evidence between the corner squares.
//
// Four corner points fix all eight degrees of freedom of a homography exactly,
// so the corners can NEVER disprove it: a curled sheet solves its four corners
// perfectly and still moves the middle of the page. Version 4 answered that
// with a timing mark per row and an anchor column per gap; version 5 answers
// it the way every camera-phone system does, with one small mark at the middle
// of each edge. A curl about a vertical axis moves the left and right marks in
// x, one about a horizontal axis moves the top and bottom marks in y, and the
// displacements interpolate into a correction over the whole page.
//
// One property carries over from the probes this replaces: a mark displaced
// further than the search window loses its ink instead of coming back clean,
// so there is no band in which a badly registered sheet reads as a well
// registered one. Displacement within the model's reach is corrected;
// displacement beyond it is a named refusal.

import { GEOMETRY } from '@transferchecker/sheet-spec';
import type { Rect, SheetLayout } from '@transferchecker/sheet-spec';
import type { Frame } from '../geometry/frame';
import { toImage } from '../geometry/frame';
import { sampleAt } from '../image/gray';
import type { GrayImage } from '../image/gray';

export interface EdgeMark {
  /** Centre the layout predicts, in sheet millimetres. */
  readonly predictedXMm: number;
  readonly predictedYMm: number;
  /** Measured minus predicted. This is what the correction interpolates. */
  readonly dxMm: number;
  readonly dyMm: number;
}

export type EdgeRead =
  | {
      readonly kind: 'ok';
      /** In the layout's order: left, right, top, bottom. */
      readonly marks: readonly EdgeMark[];
      /** Root mean square displacement over the four marks, in millimetres. */
      readonly residualMm: number;
    }
  | { readonly kind: 'missing'; readonly expected: number; readonly found: number }
  | {
      readonly kind: 'unstable';
      readonly residualMm: number;
      /** The axis the worst displacement lies on, for the teacher's message. */
      readonly axis: 'x' | 'y';
    };

/**
 * How far a mark may have moved and still be corrected rather than refused.
 *
 * Version 4 refused at half a millimetre because it could not correct in x at
 * all. The whole point of these marks is that mid-page displacement is now a
 * measurement the correction consumes, so the gate sits where the MODEL stops
 * being trustworthy rather than where the displacement starts existing: the
 * interpolation is exact at the marks and smooth between them, but a curl
 * sharp enough to move an edge midpoint by more than this is no longer the
 * low-order bend the model describes. The number is provisional until the
 * bend sweep measures it; the sweep is the gate for changing it.
 */
export const MAX_DISPLACEMENT_MM = 1.5;

/** Half-width of the search window. The layout guarantees this much blank paper. */
const SEARCH_HALF_MM = GEOMETRY.edgeMarkClearMm - 0.5;

/**
 * The mark's centre, as the centre of mass of ink in a fixed window around the
 * prediction. The same measurement the corner squares get, because it is the
 * same kind of object: a small solid square whose centre is the signal.
 */
function measureMark(
  image: GrayImage,
  frame: Frame,
  rect: Rect,
): { xMm: number; yMm: number } | null {
  const cx = rect.xMm + rect.wMm / 2;
  const cy = rect.yMm + rect.hMm / 2;
  const half = rect.wMm / 2 + SEARCH_HALF_MM;

  let low = 255;
  let high = 0;
  const values: { xMm: number; yMm: number; value: number }[] = [];
  for (let yMm = cy - half; yMm <= cy + half; yMm += 0.2) {
    for (let xMm = cx - half; xMm <= cx + half; xMm += 0.2) {
      const at = toImage(frame, xMm, yMm);
      if (at.x < 0 || at.y < 0 || at.x > image.width - 1 || at.y > image.height - 1) continue;
      const value = sampleAt(image, at.x, at.y);
      if (value < low) low = value;
      if (value > high) high = value;
      values.push({ xMm, yMm, value });
    }
  }
  // Too little contrast in the window to be a printed mark at all.
  if (values.length === 0 || high - low < 30) return null;

  const cut = (low + high) / 2;
  let weight = 0;
  let sumX = 0;
  let sumY = 0;
  for (const entry of values) {
    if (entry.value >= cut) continue;
    const w = cut - entry.value;
    weight += w;
    sumX += w * entry.xMm;
    sumY += w * entry.yMm;
  }
  return weight <= 0 ? null : { xMm: sumX / weight, yMm: sumY / weight };
}

/** Reads the four edge marks the layout says are printed. */
export function readEdgeMarks(image: GrayImage, frame: Frame, layout: SheetLayout): EdgeRead {
  const expected = layout.edgeMarks;
  const marks: EdgeMark[] = [];

  for (const rect of expected) {
    const predictedXMm = rect.xMm + rect.wMm / 2;
    const predictedYMm = rect.yMm + rect.hMm / 2;
    const found = measureMark(image, frame, rect);
    if (found === null) continue;
    marks.push({
      predictedXMm,
      predictedYMm,
      dxMm: found.xMm - predictedXMm,
      dyMm: found.yMm - predictedYMm,
    });
  }

  // All four, or a named refusal. Each mark is the only evidence for its own
  // edge's bend, so a subset is a sheet whose registration cannot be stated,
  // and the missing mark is exactly the one that moved furthest.
  if (marks.length !== expected.length) {
    return { kind: 'missing', expected: expected.length, found: marks.length };
  }

  let worst: { magnitude: number; axis: 'x' | 'y' } = { magnitude: 0, axis: 'x' };
  for (const mark of marks) {
    const magnitude = Math.hypot(mark.dxMm, mark.dyMm);
    if (magnitude > worst.magnitude) {
      worst = { magnitude, axis: Math.abs(mark.dxMm) >= Math.abs(mark.dyMm) ? 'x' : 'y' };
    }
  }
  const residualMm = Math.sqrt(
    marks.reduce((sum, mark) => sum + mark.dxMm ** 2 + mark.dyMm ** 2, 0) / marks.length,
  );
  if (worst.magnitude > MAX_DISPLACEMENT_MM) {
    return { kind: 'unstable', residualMm, axis: worst.axis };
  }
  return { kind: 'ok', marks, residualMm };
}

export interface Warp {
  /** Correction to add to a predicted sheet position before sampling it. */
  readonly at: (xMm: number, yMm: number) => { readonly dxMm: number; readonly dyMm: number };
}

const ZERO: Warp = { at: () => ({ dxMm: 0, dyMm: 0 }) };

/**
 * The correction field the four displacements define.
 *
 * Transfinite interpolation over the fiducial rectangle: each mark's weight is
 * one at the mark itself, zero at all four corners and zero at the other three
 * marks, so the field is exact at every point the sheet actually measured and
 * smooth in between. The corners get zero by construction, which is right: the
 * homography already fits them exactly.
 */
export function warpFrom(layout: SheetLayout, marks: readonly EdgeMark[]): Warp {
  const [left, right, top, bottom] = marks;
  const first = layout.fiducials[0];
  const last = layout.fiducials[3];
  if (left === undefined || right === undefined || top === undefined || bottom === undefined) {
    return ZERO;
  }
  if (first === undefined || last === undefined) return ZERO;

  const leftMm = first.xMm + first.wMm / 2;
  const topMm = first.yMm + first.hMm / 2;
  const spanX = last.xMm + last.wMm / 2 - leftMm;
  const spanY = last.yMm + last.hMm / 2 - topMm;
  if (spanX <= 0 || spanY <= 0) return ZERO;

  return {
    at: (xMm: number, yMm: number) => {
      const u = Math.max(0, Math.min(1, (xMm - leftMm) / spanX));
      const v = Math.max(0, Math.min(1, (yMm - topMm) / spanY));
      const [wLeft, wRight, wTop, wBottom] = transfiniteWeights(u, v);
      return {
        dxMm: wLeft * left.dxMm + wRight * right.dxMm + wTop * top.dxMm + wBottom * bottom.dxMm,
        dyMm: wLeft * left.dyMm + wRight * right.dyMm + wTop * top.dyMm + wBottom * bottom.dyMm,
      };
    },
  };
}

/**
 * The weight each edge mark carries at normalized position (u, v) of the
 * fiducial rectangle, in left, right, top, bottom order. One at its own mark,
 * zero at the corners and at the other marks. Shared between the geometric
 * correction and the photometric one, so a value measured at a mark is applied
 * identically whichever quantity it is a measurement of.
 */
export function transfiniteWeights(u: number, v: number): [number, number, number, number] {
  const across = 4 * u * (1 - u);
  const down = 4 * v * (1 - v);
  return [(1 - u) * down, u * down, (1 - v) * across, v * across];
}
