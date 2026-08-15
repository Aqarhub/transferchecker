// Finding, reading and decoding the sheet's printed code.
//
// The code is read before anything else is measured: until it decodes, the
// scanner does not know the paper, the bubble metrics or how many questions
// there are. Everything after this stage is arithmetic on what it says.
//
// Where to look is arithmetic too. On every sheet sheet-spec lays out, the
// code's top-right corner sits a fixed distance from the top-right corner
// square: `titleBandMm - fiducialMm / 2` to its left and
// `fiducialMm / 2 + headerGapMm` below it. Neither offset depends on the paper,
// which is the point, because the paper is exactly what we do not know yet.
// Anchoring on the top-right corner square also keeps the estimated frame's few
// percent of scale error harmless: the error is a fraction of the short offset
// to the code, not of the whole page.

import { GEOMETRY, codeModuleMmFor, decodeSheetCode } from '@transferchecker/sheet-spec';
import type { DecodedCode } from '@transferchecker/sheet-spec';
import { estimateFrame } from '../geometry/frame';
import type { Frame } from '../geometry/frame';
import type { FiducialQuad } from '../geometry/fiducials';
import { cornerReadings } from '../geometry/quad';
import type { Corners } from '../geometry/quad';
import type { GrayImage } from '../image/gray';
import { decodeQrMatrix } from '../qr/index';
import { finderHalfMm, looksLikeFinder, refineFinder } from './finder';
import type { Centre } from './finder';
import { readModules } from './read';
import { MAX_VERSION, moduleCountOf } from '../qr/versions';

/**
 * Pixels per code module below which no decoder can work.
 *
 * Defense د11 sets the floor at three. Two is the specification's own minimum
 * and leaves nothing for blur, and the plan's original pipeline decoded after a
 * quarter scale resize, which at a 0.5 mm module and a 1080 pixel frame is 0.64
 * pixels per module. That is the second of the two proven defects.
 *
 * The floor is a DIAGNOSIS and not a veto. A read that succeeds under it is
 * still a read, and is kept. A read that fails while under it is reported as
 * "come closer" rather than as an unexplained refusal, which is the whole
 * difference between a rejection a teacher can act on and one they cannot.
 */
export const MIN_MODULE_PX = 3;

/** How far a predicted finder centre may move before it is not that pattern. */
const MAX_DRIFT_MM = 1.2;

export type CodeResult =
  | {
      readonly kind: 'ok';
      readonly text: string;
      readonly decoded: DecodedCode;
      readonly corners: Corners;
      readonly modulePx: number;
    }
  | { readonly kind: 'too_small'; readonly modulePx: number }
  | { readonly kind: 'unreadable' };

/** Module counts the layout can print, largest first: a fuller code is likelier. */
function candidateSizes(): number[] {
  const sizes: number[] = [];
  for (let version = MAX_VERSION; version >= 1; version -= 1) {
    const size = moduleCountOf(version);
    const acrossMm = (size + 2 * GEOMETRY.codeQuietModules) * codeModuleMmFor(size);
    if (acrossMm <= GEOMETRY.codeMaxSizeMm) sizes.push(size);
  }
  return sizes;
}

const away = (a: Centre, b: Centre): number => Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);

interface Found {
  readonly text: string;
  readonly decoded: DecodedCode;
  readonly moduleMm: number;
}

function attempt(image: GrayImage, frame: Frame): Found | null {
  // Distance from the top-right corner square's CENTRE to the printed code's
  // own top-right corner. Neither term depends on the paper, which is the
  // point, because the paper is exactly what has not been read yet.
  const rightOffsetMm = GEOMETRY.titleBandMm + GEOMETRY.brandingBandMm - GEOMETRY.fiducialMm / 2;
  const topOffsetMm = GEOMETRY.fiducialMm / 2 + GEOMETRY.headerGapMm;

  for (const size of candidateSizes()) {
    // Defense د6 made the module a function of the module count, so the whole
    // search is now per candidate: a 21 module code prints at 1.0 mm and a 49
    // module one at 0.5 mm, which puts their top-right finder centres 4 mm
    // apart. Deriving it from the SAME function the layout printed with is what
    // keeps this arithmetic rather than search.
    const moduleMm = codeModuleMmFor(size);
    const inMm = GEOMETRY.codeQuietModules * moduleMm + finderHalfMm(moduleMm);
    const topRightGuess: Centre = {
      xMm: frame.spanXMm - rightOffsetMm - inMm,
      yMm: topOffsetMm + inMm,
    };

    const topRight = refineFinder(image, frame, topRightGuess, moduleMm);
    if (topRight === null || !looksLikeFinder(image, frame, topRight, moduleMm)) continue;

    const legMm = (size - 7) * moduleMm;
    const topLeftGuess: Centre = { xMm: topRight.xMm - legMm, yMm: topRight.yMm };
    const bottomLeftGuess: Centre = { xMm: topRight.xMm - legMm, yMm: topRight.yMm + legMm };

    const topLeft = refineFinder(image, frame, topLeftGuess, moduleMm);
    if (topLeft === null || away(topLeft, topLeftGuess) > MAX_DRIFT_MM) continue;
    const bottomLeft = refineFinder(image, frame, bottomLeftGuess, moduleMm);
    if (bottomLeft === null || away(bottomLeft, bottomLeftGuess) > MAX_DRIFT_MM) continue;
    if (!looksLikeFinder(image, frame, topLeft, moduleMm)) continue;

    const matrix = readModules(image, frame, topLeft, topRight, bottomLeft, size);
    if (matrix === null) continue;
    const text = decodeQrMatrix(matrix);
    if (text === null) continue;

    // The sheet code is validated HERE and not by the caller, because a symbol
    // read at the wrong module count can still satisfy its own error
    // correction and produce a valid but wrong payload: Reed-Solomon lands on a
    // different legal codeword. Returning that text and letting the caller find
    // it was not a sheet code abandoned the size loop with the correct size
    // still untried, and the sheet came back unreadable.
    const decoded = decodeSheetCode(text);
    if (decoded !== null) return { text, decoded, moduleMm };
  }

  return null;
}

/**
 * Reads the sheet's own description out of the frame.
 *
 * Four readings of the corner quadrilateral are tried, one per quarter turn,
 * because four identical squares carry no orientation and a teacher holding the
 * phone the other way up is an ordinary event rather than an error. The reading
 * whose code decodes is the right one, and there is no second candidate: a
 * wrong orientation puts the window over blank paper.
 */
export function readSheetCode(image: GrayImage, quad: FiducialQuad): CodeResult {
  const sides = quad.sidesPx.filter((side) => Number.isFinite(side) && side > 1);
  const pxPerMm =
    sides.length === 0
      ? 0
      : sides.reduce((sum, side) => sum + side, 0) / sides.length / GEOMETRY.fiducialMm;

  for (const corners of cornerReadings(quad.points)) {
    const frame = estimateFrame(corners, quad.sidesPx);
    if (frame === null) continue;

    const found = attempt(image, frame);
    if (found === null) continue;
    // The module size the sheet was ACTUALLY printed with, now that the code
    // has said how many modules it has. Before defense د6 this was a constant.
    return {
      kind: 'ok',
      text: found.text,
      decoded: found.decoded,
      corners,
      modulePx: pxPerMm * found.moduleMm,
    };
  }

  // Said before "unreadable" because it is the one failure with a remedy.
  //
  // Measured at the SMALLEST module a sheet may print, because a failed read
  // has not said how many modules it had and therefore has not said how large
  // they were. That is the pessimistic end on purpose: the advice it produces
  // is "come closer", which is never the wrong advice for a read that failed,
  // whereas measuring at the largest module would keep silent about resolution
  // for every sheet that prints a small one.
  const floorPx = pxPerMm * GEOMETRY.codeMinModuleMm;
  if (floorPx > 0 && floorPx < MIN_MODULE_PX) return { kind: 'too_small', modulePx: floorPx };
  return { kind: 'unreadable' };
}
