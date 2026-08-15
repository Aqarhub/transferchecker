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
 * Distance from a paper edge to the nearest fiducial's centre.
 *
 * Three numbers rather than one, defense د1: the bottom margin is larger than
 * the other two because the printer's bottom dead zone is larger, so the
 * rectangle the four squares form is NOT centred on the page. Reading it as
 * centred would put every predicted coordinate several millimetres out in y,
 * which is most of a row.
 */
export const FIDUCIAL_INSET_X_MM = GEOMETRY.marginSideMm + GEOMETRY.fiducialMm / 2;
export const FIDUCIAL_INSET_TOP_MM = GEOMETRY.marginTopMm + GEOMETRY.fiducialMm / 2;
export const FIDUCIAL_INSET_BOTTOM_MM = GEOMETRY.marginBottomMm + GEOMETRY.fiducialMm / 2;

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
  const spanXMm = layout.paper.widthMm - 2 * FIDUCIAL_INSET_X_MM;
  const spanYMm = layout.paper.heightMm - FIDUCIAL_INSET_TOP_MM - FIDUCIAL_INSET_BOTTOM_MM;
  return build(corners, spanXMm, spanYMm, {
    x: FIDUCIAL_INSET_X_MM,
    y: FIDUCIAL_INSET_TOP_MM,
  });
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
