// A sheet curled about a vertical axis, injected into a flat render.
//
// This is the one failure the corner squares cannot see and the timing marks
// cannot see either, so it is the failure the anchor marks exist for, and a
// test that cannot produce it cannot prove they work.
//
// The model is a cylinder whose axis is vertical, held flat at the two columns
// where the corner squares are printed and bulging in between. Photographed
// square on, a point at paper x lands displaced sideways by
//
//   dx(x) = bulge * sin(pi * (x - left) / (right - left))
//
// which is zero at both fiducial columns and largest in the middle of the page.
// That is exactly what makes it invisible to everything else: the four corners
// solve perfectly because they did not move, and every timing mark is printed
// inside the left corner square's own band where the displacement is under a
// tenth of a millimetre, so the residual comes back at 0.00 mm while the
// middle of the page has moved by a whole bubble pitch.
//
// The displacement can be faded in below `fromYMm` rather than applied to the
// whole page, the way a sheet curls with its top held down by a hand. Passing
// a `fromYMm` above the page top applies the cylinder to the whole page, which
// is the ordinary physical curl and the shape the edge-mark correction models
// exactly.

import { createGray, sampleAt } from '../src/image/gray';
import type { GrayImage } from '../src/image/gray';

export interface BendOptions {
  /** Pixels per millimetre of the flat render being bent. */
  readonly pxPerMm: number;
  /** Sideways displacement at the middle of the page, in millimetres. */
  readonly bulgeMm: number;
  /** Paper x of the two columns the sheet is held flat at, in millimetres. */
  readonly leftMm: number;
  readonly rightMm: number;
  /** Above this the page is flat; the curl fades in over the 10 mm below it. */
  readonly fromYMm: number;
}

/** How far the displacement takes to reach full strength, in millimetres. */
const FADE_MM = 10;

export function bendSheet(image: GrayImage, options: BendOptions): GrayImage {
  const { pxPerMm, bulgeMm, leftMm, rightMm, fromYMm } = options;
  const out = createGray(image.width, image.height, 255);
  const spanMm = rightMm - leftMm;

  for (let y = 0; y < image.height; y += 1) {
    const yMm = (y + 0.5) / pxPerMm;
    const fade = Math.max(0, Math.min(1, (yMm - fromYMm) / FADE_MM));

    for (let x = 0; x < image.width; x += 1) {
      const xMm = (x + 0.5) / pxPerMm;
      const along = spanMm <= 0 ? 0 : (xMm - leftMm) / spanMm;
      const shapedMm = along <= 0 || along >= 1 ? 0 : bulgeMm * Math.sin(Math.PI * along) * fade;
      // Read from where the ink WAS, so it appears where the curl puts it.
      out.data[y * out.stride + x] = sampleAt(image, x - shapedMm * pxPerMm, y);
    }
  }

  return out;
}
