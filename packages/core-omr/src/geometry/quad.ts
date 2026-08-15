// Putting four detected corner squares into the order the sheet prints them in.
//
// sheet-spec emits its fiducials as top-left, top-right, bottom-left,
// bottom-right, and the scanner has to hand the solver the same four points in
// the same order or the map it solves is a reflection of the sheet.
//
// The sheet gives no clue which corner is which: the four squares are
// identical. So the order is recovered from the geometry, and the remaining
// ambiguity, which quarter turn the paper was photographed at, is settled by
// whether the printed code decodes. A teacher holding the phone upside down is
// an ordinary event, not an error.

import type { Point } from './homography';

/** Four points in the sheet's own order: top-left, top-right, bottom-left, bottom-right. */
export type Corners = readonly [Point, Point, Point, Point];

/** Twice the signed area. Positive means clockwise on screen, where y grows downward. */
function signedArea(points: readonly Point[]): number {
  let total = 0;
  for (const [index, current] of points.entries()) {
    const next = points[(index + 1) % points.length];
    if (next === undefined) continue;
    total += current.x * next.y - next.x * current.y;
  }
  return total;
}

/** Convex order around the centre, clockwise on screen. Null if the four are degenerate. */
function convexCycle(points: readonly Point[]): Point[] | null {
  if (points.length !== 4) return null;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / 4;
  const ordered = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  const area = signedArea(ordered);
  if (!Number.isFinite(area) || Math.abs(area) < 1e-6) return null;
  return area > 0 ? ordered : ordered.reverse();
}

/**
 * The four points as a cycle starting at the corner nearest the frame's own top
 * left, going clockwise. This is the zero rotation reading; the other three are
 * quarter turns of it.
 */
export function cornerCycle(points: readonly Point[]): Point[] | null {
  const cycle = convexCycle(points);
  if (cycle === null) return null;

  let first = 0;
  let best = Number.POSITIVE_INFINITY;
  for (const [index, point] of cycle.entries()) {
    const score = point.x + point.y;
    if (score < best) {
      best = score;
      first = index;
    }
  }
  return [0, 1, 2, 3].map((step) => {
    const point = cycle[(first + step) % 4];
    if (point === undefined) throw new Error('quad: cycle lost a corner');
    return point;
  });
}

/**
 * The four readings of one detected quadrilateral, one per quarter turn of the
 * paper, each already in the sheet's own corner order.
 */
export function cornerReadings(points: readonly Point[]): Corners[] {
  const cycle = cornerCycle(points);
  if (cycle === null) return [];

  return [0, 1, 2, 3].map((turn) => {
    const pick = (step: number): Point => {
      const point = cycle[(turn + step) % 4];
      if (point === undefined) throw new Error('quad: cycle lost a corner');
      return point;
    };
    // The cycle runs top-left, top-right, bottom-right, bottom-left, and the
    // sheet's order puts bottom-left before bottom-right.
    return [pick(0), pick(1), pick(3), pick(2)] as const;
  });
}

/** Longest side of the quadrilateral, in the units its points are given in. */
export function longestSide(corners: Corners): number {
  const [topLeft, topRight, bottomLeft, bottomRight] = corners;
  return Math.max(
    Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y),
    Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y),
    Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y),
    Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y),
  );
}
