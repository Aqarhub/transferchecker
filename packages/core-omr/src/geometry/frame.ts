// The map between millimetres on the sheet and pixels in the frame.
//
// Two frames exist, and the difference between them is the whole reason the
// scanner can read a sheet whose paper size it does not yet know.
//
// The ESTIMATED frame comes first. Its origin is the top-left fiducial centre
// and its unit is a millimetre recovered from the fiducial's own printed side
// of 8 mm, so it is metric without knowing the paper. It is accurate to a few
// percent, which is far more than enough to put a 37 mm window over a code that
// sits at a fixed offset from the top-right corner square on every sheet we
// print, whatever the paper.
//
// The PAPER frame comes after the code has been read, when the paper is known
// and every coordinate sheet-spec produces becomes usable directly.

import { GEOMETRY } from '@transferchecker/sheet-spec';
import type { SheetLayout } from '@transferchecker/sheet-spec';
import { homographyFrom, invert, project, scaleAt } from './homography';
import type { Matrix3, Point } from './homography';
import type { Corners } from './quad';

export interface Frame {
  /** Sheet millimetres to frame pixels. */
  readonly toImage: Matrix3;
  /** Frame pixels to sheet millimetres. */
  readonly toPaper: Matrix3;
  /** Frame pixels per millimetre at the middle of the sheet. */
  readonly pxPerMm: number;
  /** Span of the fiducial rectangle in this frame's own millimetres. */
  readonly spanXMm: number;
  readonly spanYMm: number;
}

/**
 * Distance from a paper edge to the nearest fiducial's centre, horizontally.
 *
 * Only the horizontal inset is a constant now. The top one stopped being one
 * in version 5, when the letterhead band started moving the top corner row:
 * the vertical insets come from the layout's own fiducial rectangles, which
 * carry whatever the sheet actually printed.
 */
export const FIDUCIAL_INSET_X_MM = GEOMETRY.marginSideMm + GEOMETRY.fiducialMm / 2;

function build(corners: Corners, spanXMm: number, spanYMm: number, originMm: Point): Frame | null {
  const source: Point[] = [
    { x: originMm.x, y: originMm.y },
    { x: originMm.x + spanXMm, y: originMm.y },
    { x: originMm.x, y: originMm.y + spanYMm },
    { x: originMm.x + spanXMm, y: originMm.y + spanYMm },
  ];
  const toImage = homographyFrom(source, [...corners]);
  if (toImage === null) return null;
  const toPaper = invert(toImage);
  if (toPaper === null) return null;

  const centre = { x: originMm.x + spanXMm / 2, y: originMm.y + spanYMm / 2 };
  return {
    toImage,
    toPaper,
    pxPerMm: scaleAt(toImage, centre.x, centre.y),
    spanXMm,
    spanYMm,
  };
}

/**
 * The metric frame recovered from the corner squares alone.
 *
 * Its origin is the top-left fiducial centre. `sidesPx` are the measured sides
 * of the four squares, which are 8 mm on paper, so their mean gives pixels per
 * millimetre without any assumption about the paper size.
 */
export function estimateFrame(corners: Corners, sidesPx: readonly number[]): Frame | null {
  const usable = sidesPx.filter((side) => Number.isFinite(side) && side > 1);
  if (usable.length === 0) return null;
  const pxPerMm = usable.reduce((sum, side) => sum + side, 0) / usable.length / GEOMETRY.fiducialMm;
  if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) return null;

  const [topLeft, topRight, bottomLeft, bottomRight] = corners;
  const topEdge = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const bottomEdge = Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y);
  const leftEdge = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  const rightEdge = Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y);

  const spanXMm = (topEdge + bottomEdge) / 2 / pxPerMm;
  const spanYMm = (leftEdge + rightEdge) / 2 / pxPerMm;
  if (spanXMm < 20 || spanYMm < 20) return null;

  return build(corners, spanXMm, spanYMm, { x: 0, y: 0 });
}

/** The true frame, once the code has said which paper this is. */
export function paperFrame(corners: Corners, layout: SheetLayout): Frame | null {
  // The rectangle comes from the layout's own fiducials rather than from
  // GEOMETRY constants, because since version 5 the top corner row's position
  // depends on the letterhead band and the layout is the one source of truth
  // for where anything sits.
  const first = layout.fiducials[0];
  const last = layout.fiducials[3];
  if (first === undefined || last === undefined) return null;
  const originX = first.xMm + first.wMm / 2;
  const originY = first.yMm + first.hMm / 2;
  const spanXMm = last.xMm + last.wMm / 2 - originX;
  const spanYMm = last.yMm + last.hMm / 2 - originY;
  if (spanXMm <= 0 || spanYMm <= 0) return null;
  return build(corners, spanXMm, spanYMm, { x: originX, y: originY });
}

export function toImage(frame: Frame, xMm: number, yMm: number): Point {
  return project(frame.toImage, xMm, yMm);
}

/**
 * Pixels per millimetre where it actually matters rather than on average.
 *
 * Under perspective the far edge of a tilted page carries fewer pixels per
 * millimetre than the near edge, and the printed code lives at one corner, so
 * the page average would overstate the resolution the code is really read at.
 */
export function pxPerMmAt(frame: Frame, xMm: number, yMm: number): number {
  return scaleAt(frame.toImage, xMm, yMm);
}

export function toPaper(frame: Frame, x: number, y: number): Point {
  return project(frame.toPaper, x, y);
}

/**
 * The printed corner square's side, measured back through the map its own four
 * centres define.
 *
 * This is the one measurement the map cannot absorb. Four correspondences fix
 * all eight degrees of freedom of a homography exactly, so the four CENTRES can
 * never disprove themselves: any four points solve perfectly against any other
 * four. But each square is also a printed 8 mm object, and its size was never
 * fed to the solve, so pushing it back through the map is an independent test
 * of whether the map is the right one.
 *
 * [measured] On every frame the engine must accept, flat renders at 6 and 8
 * pixels per millimetre and photographs at 1080p and 1440p with tilt, blur,
 * noise and a shadow, this returns between 7.984 mm and 8.000 mm. On an A4
 * carrier holding two A5 sheets, where the detector locks onto the outer four
 * of the eight squares and the map is stretched 2.24 times in x, it returns
 * 4.97 mm.
 *
 * A uniform print scale is absorbed exactly, which is correct: the sheet is
 * still self consistent and د16 says a scaled page is undetectable from its own
 * content and harmless. An anisotropic stretch is absorbed too, because the
 * side comes from an ink area and the local scale is the mean of both axes, and
 * that is also correct: a sheet stretched with its own furniture still grades.
 */
export function fiducialSideMm(
  frame: Frame,
  layout: SheetLayout,
  sidesPx: readonly number[],
): number {
  const usable = sidesPx.filter((side) => Number.isFinite(side) && side > 1);
  if (usable.length === 0 || layout.fiducials.length === 0) return GEOMETRY.fiducialMm;

  const meanSidePx = usable.reduce((sum, side) => sum + side, 0) / usable.length;
  // Averaged over the four corners rather than paired with them, because the
  // sides are measured in the detector's own order and the corners are read in
  // whichever of the four quarter turns decoded the code.
  const scales = layout.fiducials.map((rect) =>
    pxPerMmAt(frame, rect.xMm + rect.wMm / 2, rect.yMm + rect.hMm / 2),
  );
  const meanScale = scales.reduce((sum, scale) => sum + scale, 0) / scales.length;
  return meanScale > 0 ? meanSidePx / meanScale : GEOMETRY.fiducialMm;
}
