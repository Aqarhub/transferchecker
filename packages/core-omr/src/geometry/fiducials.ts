// Finding the four solid corner squares.
//
// This is the only stage that searches the frame without knowing where to look,
// and it is why this package needs no general contour finder. A general scanner
// hunts for a page edge, which is a thin low contrast line against a desk. We
// hunt for four filled 8 mm squares, which are the largest solid ink on the
// page by a wide margin: a bubble is 4 mm across and hollow, a timing mark is a
// 6 by 3 bar, and the printed code is half paper by area. Solidity and squareness
// separate them without a single tuned magic number about page edges.

import { downscale, downscaleFactorFor } from '../image/downscale';
import type { GrayImage } from '../image/gray';
import { adaptiveInk } from '../image/integral';
import type { Mask } from '../image/integral';
import { aspect, blobHeight, blobWidth, findBlobs, solidity } from '../image/blobs';
import type { Blob } from '../image/blobs';
import type { Point } from './homography';

/** Long side of the copy the search runs on. Enough to see an 8 mm square, no more. */
const SEARCH_LONG_SIDE = 400;
const MIN_SIDE_PX = 4;
const MAX_ASPECT = 1.6;
const MIN_SOLIDITY = 0.72;
/**
 * How different in area two corner squares of one sheet may be.
 *
 * Perspective is the reason this is not tighter. The near corner of a tilted
 * page carries more pixels per millimetre than the far one, and area goes as
 * the square of that, so a tilt steep enough to halve the far edge quadruples
 * the area ratio. Four is that limit, and a sheet tilted past it has already
 * lost the resolution the printed code needs.
 */
const AREA_SPREAD = 4;

export interface FiducialQuad {
  /** Refined centres in frame pixels, at full resolution. */
  readonly points: readonly Point[];
  /**
   * Measured side of each square in frame pixels, in the same order.
   *
   * This is the scanner's only metric reference before the code is read: the
   * square is 8 mm by construction, so its side in pixels is pixels per
   * millimetre, measured rather than assumed, and independent of which paper
   * the sheet turns out to be.
   */
  readonly sidesPx: readonly number[];
}

export type FiducialSearch =
  | { readonly kind: 'ok'; readonly quad: FiducialQuad }
  | { readonly kind: 'not_found'; readonly candidates: number };

function squareCandidates(mask: Mask): Blob[] {
  const maxSide = Math.max(mask.width, mask.height) / 3;
  return findBlobs(mask, MIN_SIDE_PX * MIN_SIDE_PX)
    .filter((blob) => {
      const w = blobWidth(blob);
      const h = blobHeight(blob);
      if (w < MIN_SIDE_PX || h < MIN_SIDE_PX || w > maxSide || h > maxSide) return false;
      // A square that runs off the frame is a square we cannot centre, and a
      // centre we cannot trust moves every bubble on the page.
      if (blob.minX === 0 || blob.minY === 0) return false;
      if (blob.maxX === mask.width - 1 || blob.maxY === mask.height - 1) return false;
      return aspect(blob) <= MAX_ASPECT && solidity(blob) >= MIN_SOLIDITY;
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, 64);
}

/** The four extremes of a group, or null when two of them are the same blob. */
function extremesOf(group: readonly Blob[]): Blob[] | null {
  const start = group[0];
  if (start === undefined) return null;

  // Sum and difference of the coordinates: the smallest sum is the top-left
  // corner and the largest is the bottom-right, and the difference does the
  // same for the other diagonal. It holds for any rotation up to a quarter
  // turn, and beyond that the labels are arbitrary anyway, which is why the
  // caller tries all four quarter turns.
  let topLeft = start;
  let topRight = start;
  let bottomLeft = start;
  let bottomRight = start;

  for (const blob of group) {
    if (blob.cx + blob.cy < topLeft.cx + topLeft.cy) topLeft = blob;
    if (blob.cx + blob.cy > bottomRight.cx + bottomRight.cy) bottomRight = blob;
    if (blob.cx - blob.cy > topRight.cx - topRight.cy) topRight = blob;
    if (blob.cx - blob.cy < bottomLeft.cx - bottomLeft.cy) bottomLeft = blob;
  }

  const chosen = [topLeft, topRight, bottomLeft, bottomRight];
  const distinct = new Set(chosen);
  return distinct.size === 4 ? chosen : null;
}

function quadArea(blobs: readonly Blob[]): number {
  const [a, b, c, d] = blobs;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return 0;
  // Corner order here is top-left, top-right, bottom-left, bottom-right, so the
  // ring visits them as a, b, d, c.
  const ring = [a, b, d, c];
  let total = 0;
  for (const [index, current] of ring.entries()) {
    const next = ring[(index + 1) % 4];
    if (next === undefined) continue;
    total += current.cx * next.cy - next.cx * current.cy;
  }
  return Math.abs(total) / 2;
}

/** The largest square quadrilateral among blobs of a consistent size. */
function bestQuad(candidates: readonly Blob[]): Blob[] | null {
  let best: Blob[] | null = null;
  let bestScore = 0;

  for (const seed of candidates) {
    const group = candidates.filter(
      (blob) => blob.area >= seed.area / AREA_SPREAD && blob.area <= seed.area * AREA_SPREAD,
    );
    if (group.length < 4) continue;
    const quad = extremesOf(group);
    if (quad === null) continue;

    const areas = quad.map((blob) => blob.area);
    if (Math.max(...areas) > Math.min(...areas) * AREA_SPREAD) continue;

    const score = quadArea(quad);
    if (score > bestScore) {
      bestScore = score;
      best = quad;
    }
  }
  return best;
}

/**
 * Re-measures one square in the frame at full resolution.
 *
 * The coarse pass gives a centre good to a pixel of the small copy, which is
 * several pixels of the real frame, and every bubble position is derived from
 * these four points. The window is cut around the coarse centre, split at the
 * midpoint of its own range so a shadow does not move the edge, and the centre
 * of mass of the ink inside it is the answer.
 */
function refine(image: GrayImage, centre: Point, sidePx: number): { point: Point; sidePx: number } {
  const half = Math.max(4, Math.round(sidePx * 0.9));
  const left = Math.max(0, Math.round(centre.x) - half);
  const top = Math.max(0, Math.round(centre.y) - half);
  const right = Math.min(image.width - 1, Math.round(centre.x) + half);
  const bottom = Math.min(image.height - 1, Math.round(centre.y) + half);
  if (right - left < 4 || bottom - top < 4) return { point: centre, sidePx };

  let low = 255;
  let high = 0;
  for (let y = top; y <= bottom; y += 1) {
    const row = y * image.stride;
    for (let x = left; x <= right; x += 1) {
      const value = image.data[row + x] ?? 0;
      if (value < low) low = value;
      if (value > high) high = value;
    }
  }
  // Too little contrast in the window to be a printed square at all.
  if (high - low < 24) return { point: centre, sidePx };

  const cut = (low + high) / 2;
  let sum = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = top; y <= bottom; y += 1) {
    const row = y * image.stride;
    for (let x = left; x <= right; x += 1) {
      if ((image.data[row + x] ?? 255) >= cut) continue;
      sum += 1;
      sumX += x;
      sumY += y;
    }
  }
  if (sum === 0) return { point: centre, sidePx };
  // The square is solid, so the square root of its ink area is its side, and
  // that is a far steadier measurement than either edge of a blurred image.
  return { point: { x: sumX / sum, y: sumY / sum }, sidePx: Math.sqrt(sum) };
}

/** The four corner squares of the sheet, in frame pixels at full resolution. */
export function findFiducials(image: GrayImage): FiducialSearch {
  const factor = downscaleFactorFor(image, SEARCH_LONG_SIDE);
  const small = downscale(image, factor);
  const candidates = squareCandidates(adaptiveInk(small));
  const quad = bestQuad(candidates);
  if (quad === null) return { kind: 'not_found', candidates: candidates.length };

  const refined = quad.map((blob) => {
    // Block downscale maps a factor by factor block onto one pixel, so the
    // small pixel's centre sits at the middle of that block in the real frame.
    const coarse = {
      x: (blob.cx + 0.5) * factor - 0.5,
      y: (blob.cy + 0.5) * factor - 0.5,
    };
    return refine(image, coarse, ((blobWidth(blob) + blobHeight(blob)) / 2) * factor);
  });

  return {
    kind: 'ok',
    quad: {
      points: refined.map((entry) => entry.point),
      sidesPx: refined.map((entry) => entry.sidePx),
    },
  };
}
