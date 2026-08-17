// The black and white the paper itself declares, at every point on it.
//
// This is defense د7, and it is what makes an absolute ink floor safe. The
// plan's rule normalised each question on its own brightest bubble, which is a
// denominator made of the very thing being measured: on an untouched question
// the brightest thing in the row is dust, and dividing by dust returns a
// confident answer. The fix is not a better denominator inside the row, it is a
// denominator from outside it.
//
// The sheet prints its own reference and nobody was reading it. Four squares
// of solid ink sit at known millimetres in the corners, four more at the
// middle of the edges, and guaranteed white paper surrounds all of them. Two
// point calibration per sheet, corrected from the edge marks, gives every
// bubble a locally expected black and a locally expected white. A shadow then
// becomes a measured gradient rather than an unknown, and an absolute floor
// measured on that scale means what it says.

import { GEOMETRY } from '@transferchecker/sheet-spec';
import type { SheetLayout } from '@transferchecker/sheet-spec';
import type { Frame } from '../geometry/frame';
import { toImage } from '../geometry/frame';
import { sampleAt } from '../image/gray';
import type { GrayImage } from '../image/gray';
import { transfiniteWeights } from './edge';
import type { EdgeMark } from './edge';

export interface Reference {
  readonly black: number;
  readonly white: number;
}

export interface PhotometricField {
  /** Corner references in the sheet's own order, and the box they span. */
  readonly corners: readonly Reference[];
  readonly leftMm: number;
  readonly topMm: number;
  readonly spanXMm: number;
  readonly spanYMm: number;
  /**
   * Mid-edge corrections measured at the four edge marks, in left, right,
   * top, bottom order. Empty when the marks were not read.
   */
  readonly edges: readonly {
    readonly blackShift: number;
    readonly whiteShift: number;
  }[];
  /** Smallest black to white separation found on the sheet, in grey levels. */
  readonly contrast: number;
}

/** Percentile of a sample set. Robust where a mean would follow a highlight. */
function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[at] ?? 0;
}

function sampleBox(
  image: GrayImage,
  frame: Frame,
  cxMm: number,
  cyMm: number,
  halfMm: number,
  stepMm: number,
): number[] {
  const values: number[] = [];
  for (let yMm = cyMm - halfMm; yMm <= cyMm + halfMm; yMm += stepMm) {
    for (let xMm = cxMm - halfMm; xMm <= cxMm + halfMm; xMm += stepMm) {
      const at = toImage(frame, xMm, yMm);
      if (at.x < 0 || at.y < 0 || at.x > image.width - 1 || at.y > image.height - 1) continue;
      values.push(sampleAt(image, at.x, at.y));
    }
  }
  return values;
}

/** Ink inside a printed square, taken low so a highlight on it cannot lift it. */
function inkOf(image: GrayImage, frame: Frame, cxMm: number, cyMm: number, halfMm: number): number {
  return percentile(sampleBox(image, frame, cxMm, cyMm, halfMm, 0.25), 0.25);
}

/**
 * Paper around a printed square, taken high so a stray mark cannot pull it down.
 *
 * The ring sits outside the square and inside the margin, where the sheet
 * prints nothing by construction, and the high percentile covers the case where
 * something strayed in anyway.
 */
function paperAround(
  image: GrayImage,
  frame: Frame,
  cxMm: number,
  cyMm: number,
  innerMm: number,
  outerMm: number,
): number {
  const values: number[] = [];
  for (let yMm = cyMm - outerMm; yMm <= cyMm + outerMm; yMm += 0.3) {
    for (let xMm = cxMm - outerMm; xMm <= cxMm + outerMm; xMm += 0.3) {
      if (Math.abs(xMm - cxMm) <= innerMm && Math.abs(yMm - cyMm) <= innerMm) continue;
      const at = toImage(frame, xMm, yMm);
      if (at.x < 0 || at.y < 0 || at.x > image.width - 1 || at.y > image.height - 1) continue;
      values.push(sampleAt(image, at.x, at.y));
    }
  }
  return percentile(values, 0.75);
}

function referenceAtFiducial(
  image: GrayImage,
  frame: Frame,
  cxMm: number,
  cyMm: number,
): Reference {
  const half = GEOMETRY.fiducialMm / 2;
  return {
    black: inkOf(image, frame, cxMm, cyMm, half * 0.6),
    white: paperAround(image, frame, cxMm, cyMm, half * 1.25, half * 1.9),
  };
}

/**
 * Builds the reference field from the sheet's own printed furniture.
 *
 * `edgeMarks` are the measured mid-edge marks, which carry the same ink as
 * the corner squares. Measuring black and white at them corrects a shadow
 * whose gradient bends between the corners, in both directions of the page.
 * Without them the field is bilinear between four corners, which a hard
 * shadow edge crossing the middle defeats exactly where the bubbles are.
 */
export function photometryOf(
  image: GrayImage,
  frame: Frame,
  layout: SheetLayout,
  edgeMarks: readonly EdgeMark[],
): PhotometricField | null {
  const corners = layout.fiducials.map((rect) =>
    referenceAtFiducial(image, frame, rect.xMm + rect.wMm / 2, rect.yMm + rect.hMm / 2),
  );
  if (corners.length !== 4) return null;

  const contrast = Math.min(...corners.map((corner) => corner.white - corner.black));
  // Below this the frame is not carrying a printed sheet at all, or it is a two
  // level image, which defense د16 refuses at the door rather than measuring.
  if (!Number.isFinite(contrast) || contrast < 40) return null;

  const leftMm = layout.fiducials[0]?.xMm ?? 0;
  const topMm = layout.fiducials[0]?.yMm ?? 0;
  const spanXMm = (layout.fiducials[1]?.xMm ?? 0) - leftMm;
  const spanYMm = (layout.fiducials[2]?.yMm ?? 0) - topMm;
  if (spanXMm <= 0 || spanYMm <= 0) return null;

  const half = GEOMETRY.fiducialMm / 2;
  const base: PhotometricField = {
    corners,
    leftMm: leftMm + half,
    topMm: topMm + half,
    spanXMm,
    spanYMm,
    edges: [],
    contrast,
  };

  // Measured at the marks' MEASURED centres rather than their predicted ones,
  // so a corrected sheet's photometry is read off the ink that is actually
  // there. The shift each mark contributes is against what the corner
  // bilinear predicts at that spot.
  const markMm = GEOMETRY.edgeMarkMm;
  const edges = edgeMarks.map((mark) => {
    const xMm = mark.predictedXMm + mark.dxMm;
    const yMm = mark.predictedYMm + mark.dyMm;
    const measured: Reference = {
      black: inkOf(image, frame, xMm, yMm, markMm * 0.3),
      white: paperAround(image, frame, xMm, yMm, markMm * 0.8, markMm * 1.4),
    };
    const predicted = referenceAt(base, xMm, yMm);
    return {
      blackShift: measured.black - predicted.black,
      whiteShift: measured.white - predicted.white,
    };
  });

  return { ...base, edges: edges.length === 4 ? edges : [] };
}

function bilinear(
  field: PhotometricField,
  xMm: number,
  yMm: number,
  pick: (r: Reference) => number,
): number {
  const u = Math.max(0, Math.min(1, (xMm - field.leftMm) / field.spanXMm));
  const v = Math.max(0, Math.min(1, (yMm - field.topMm) / field.spanYMm));
  const [topLeft, topRight, bottomLeft, bottomRight] = field.corners;
  if (
    topLeft === undefined ||
    topRight === undefined ||
    bottomLeft === undefined ||
    bottomRight === undefined
  ) {
    return 0;
  }
  const top = pick(topLeft) + (pick(topRight) - pick(topLeft)) * u;
  const bottom = pick(bottomLeft) + (pick(bottomRight) - pick(bottomLeft)) * u;
  return top + (bottom - top) * v;
}

/**
 * The mid-edge corrections' contribution at one point, through the same
 * transfinite weights the geometric correction uses: exact at each mark, zero
 * at the corners the bilinear already fits.
 */
function edgeShift(
  field: PhotometricField,
  xMm: number,
  yMm: number,
  pick: (edge: PhotometricField['edges'][number]) => number,
): number {
  const [left, right, top, bottom] = field.edges;
  if (left === undefined || right === undefined || top === undefined || bottom === undefined) {
    return 0;
  }
  const u = Math.max(0, Math.min(1, (xMm - field.leftMm) / field.spanXMm));
  const v = Math.max(0, Math.min(1, (yMm - field.topMm) / field.spanYMm));
  const [wLeft, wRight, wTop, wBottom] = transfiniteWeights(u, v);
  return wLeft * pick(left) + wRight * pick(right) + wTop * pick(top) + wBottom * pick(bottom);
}

/** What black and white are expected to read as, at one point on the sheet. */
export function referenceAt(field: PhotometricField, xMm: number, yMm: number): Reference {
  const black =
    bilinear(field, xMm, yMm, (r) => r.black) + edgeShift(field, xMm, yMm, (e) => e.blackShift);
  const white =
    bilinear(field, xMm, yMm, (r) => r.white) + edgeShift(field, xMm, yMm, (e) => e.whiteShift);
  // A shadow may push both together, but it may never cross them over.
  return white - black < 20 ? { black, white: black + 20 } : { black, white };
}

/** A grey value as ink, where 0 is the paper here and 1 is solid printed ink here. */
export function inkRatio(reference: Reference, value: number): number {
  const span = reference.white - reference.black;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (reference.white - value) / span));
}
