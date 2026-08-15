// What a printer does to a page when the teacher leaves Fit to page on.
//
// Acceptance criterion 15 needs this: a sheet printed at 90, 94, 96, 100 and 104
// percent must either grade identically or be refused by name, and it must never
// be silently corrected into a different grade. The scaling is about the page
// centre, which is what a driver's "fit to printable area" does, and it takes
// the corner squares with it, so nothing on the sheet reveals the scale except
// the paper's own edge.

import { createGray, sampleAt } from '../src/image/gray';
import type { GrayImage } from '../src/image/gray';

/**
 * Re-prints a rendered page at `factor` of its size, centred, on paper of the
 * same size. Below one the page shrinks and white paper appears around it;
 * above one the edges run off, which is how corner squares get cropped.
 */
export function scalePrint(image: GrayImage, factor: number, paper = 216): GrayImage {
  const out = createGray(image.width, image.height, paper);
  const cx = image.width / 2;
  const cy = image.height / 2;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sourceX = cx + (x + 0.5 - cx) / factor;
      const sourceY = cy + (y + 0.5 - cy) / factor;
      if (sourceX < 0 || sourceY < 0 || sourceX > image.width - 1 || sourceY > image.height - 1) {
        continue;
      }
      out.data[y * out.stride + x] = Math.round(sampleAt(image, sourceX, sourceY));
    }
  }
  return out;
}
