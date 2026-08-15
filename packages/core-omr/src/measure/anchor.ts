// Reading the anchor marks, which are the sheet's only evidence about
// registration in the horizontal axis.
//
// The timing marks fix y beautifully and say nothing at all about x: every one
// of them sits at a single value of x, inside the band the left corner squares
// already occupy. Four corner points fix all eight degrees of freedom of a
// homography exactly, so a sheet curled about a vertical axis, zero at the
// corner columns and peaking in the middle of the page, solves its four corners
// perfectly, leaves a timing residual of 0.00 mm, and still moves the middle
// bubbles by a whole pitch. Nothing in the engine could see it, because nothing
// on the paper measured it.
//
// The anchors are that measurement: the same mark, on the same rows, at an x
// the corners do not pin. They are read exactly as the timing marks are, with
// the axes exchanged.
//
// One property is worth stating because the probe it replaced did not have it.
// A mark displaced further than the search window loses its ink instead of
// coming back clean: the measured offset grows with the displacement until the
// window empties, and then the read fails and the sheet is refused. There is no
// band in which a badly registered sheet reads as a well registered one, which
// is precisely the fault that disqualified the escape ring asymmetry as a gate.

import type { AnchorColumn, Rect, SheetLayout } from '@transferchecker/sheet-spec';
import type { Frame } from '../geometry/frame';
import { toImage } from '../geometry/frame';
import { sampleAt } from '../image/gray';
import type { GrayImage } from '../image/gray';

export interface AnchorColumnRead {
  /** Where the layout says this column of marks is printed. */
  readonly xMm: number;
  /** Measured minus predicted, averaged over the column's marks. Signed. */
  readonly offsetMm: number;
}

export type AnchorRead =
  | {
      readonly kind: 'ok';
      readonly columns: readonly AnchorColumnRead[];
      /** Root mean square of measured against predicted centres, in millimetres. */
      readonly residualMm: number;
    }
  /**
   * The sheet prints no anchor at all. A one column sheet with no room beside
   * its grid has nowhere to put one, and that is reported as an absent
   * measurement rather than as a measurement of zero: "no error" and "could not
   * look" are different sentences and only one of them is true.
   */
  | { readonly kind: 'none' }
  | { readonly kind: 'missing'; readonly expected: number; readonly found: number }
  | { readonly kind: 'unstable'; readonly residualMm: number };

/**
 * How far a mark's measured centre may sit from its predicted one in x.
 *
 * The same half millimetre the timing marks are held to, and it is the tighter
 * demand of the two: half a millimetre of lateral error moves about 0.19 of a
 * bubble's fill ratio at the default radius, against an uncertainty margin of
 * 0.08. Anything past it is a sheet whose middle is not where its corners say.
 */
export const MAX_X_RESIDUAL_MM = 0.5;

/**
 * How far the search runs on each side of a mark's predicted centre.
 *
 * Exactly the clearance the layout guarantees beside an anchor, so the window
 * cannot reach printed ink however the sheet is registered. It also sets where
 * this probe stops measuring and starts refusing: past about a millimetre of
 * displacement the mark is clipped by the window and the offset reads low but
 * still grows, and past the window it is gone and the read fails.
 */
const SEARCH_HALF_MM = 2.5;

/** Steps along the search, and across the mark's height. */
const STEP_MM = 0.1;
const ACROSS_STEP_MM = 0.25;

/** The mark's centre in x, as the centre of mass of its ink. */
function measureMark(image: GrayImage, frame: Frame, rect: Rect): number | null {
  const predicted = rect.xMm + rect.wMm / 2;
  // Inset from both ends of the mark's height so that a small error in y, which
  // the timing marks have already bounded, cannot empty the profile.
  const insetYMm = rect.hMm * 0.25;

  const values: { xMm: number; value: number }[] = [];
  let low = 255;
  let high = 0;
  for (let xMm = predicted - SEARCH_HALF_MM; xMm <= predicted + SEARCH_HALF_MM; xMm += STEP_MM) {
    let sum = 0;
    let count = 0;
    for (
      let yMm = rect.yMm + insetYMm;
      yMm <= rect.yMm + rect.hMm - insetYMm;
      yMm += ACROSS_STEP_MM
    ) {
      const at = toImage(frame, xMm, yMm);
      if (at.x < 0 || at.y < 0 || at.x > image.width - 1 || at.y > image.height - 1) continue;
      sum += sampleAt(image, at.x, at.y);
      count += 1;
    }
    if (count === 0) continue;
    const value = sum / count;
    if (value < low) low = value;
    if (value > high) high = value;
    values.push({ xMm, value });
  }

  // No ink in the window is a real answer: the mark is not where the geometry
  // says it is, by more than the window is wide.
  if (values.length === 0 || high - low < 30) return null;

  const cut = (low + high) / 2;
  let weight = 0;
  let sum = 0;
  for (const entry of values) {
    if (entry.value >= cut) continue;
    const w = cut - entry.value;
    weight += w;
    sum += w * entry.xMm;
  }
  return weight <= 0 ? null : sum / weight;
}

function readColumn(
  image: GrayImage,
  frame: Frame,
  column: AnchorColumn,
): { readonly offsets: number[]; readonly found: number } {
  const offsets: number[] = [];
  for (const rect of column.marks) {
    const measured = measureMark(image, frame, rect);
    if (measured === null) continue;
    offsets.push(measured - (rect.xMm + rect.wMm / 2));
  }
  return { offsets, found: offsets.length };
}

/** Reads every anchor mark the layout says is printed. */
export function readAnchors(image: GrayImage, frame: Frame, layout: SheetLayout): AnchorRead {
  const expected = layout.anchorColumns.reduce((total, column) => total + column.marks.length, 0);
  if (expected === 0) return { kind: 'none' };

  const columns: AnchorColumnRead[] = [];
  const all: number[] = [];
  let found = 0;

  for (const column of layout.anchorColumns) {
    const read = readColumn(image, frame, column);
    found += read.found;
    all.push(...read.offsets);
    if (read.offsets.length === 0) continue;
    columns.push({
      xMm: column.xMm,
      offsetMm: read.offsets.reduce((sum, offset) => sum + offset, 0) / read.offsets.length,
    });
  }

  // Every mark, or a named refusal, for the same reason the timing marks demand
  // all of theirs: a subset is a sheet we cannot say is registered, and the
  // missing ones are exactly the ones that moved furthest.
  if (found !== expected) return { kind: 'missing', expected, found };

  const residualMm = Math.sqrt(all.reduce((sum, offset) => sum + offset ** 2, 0) / all.length);
  if (residualMm > MAX_X_RESIDUAL_MM) return { kind: 'unstable', residualMm };
  return { kind: 'ok', columns, residualMm };
}
