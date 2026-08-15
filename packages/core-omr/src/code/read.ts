// Reading the module grid off the frame at full resolution.
//
// Nothing is resampled. Each module's value is the mean of a small sub-sample
// taken at millimetre positions on the sheet, pushed through the same map the
// corner squares gave us and read where they land in the original frame. That
// is defense د11 as a code path rather than as a sentence in a document: the
// plan's first sketch decoded the code after shrinking the frame to a quarter,
// which is 0.64 pixels per module and cannot work at all.

import type { QrMatrix } from '@transferchecker/sheet-spec';
import type { Frame } from '../geometry/frame';
import { toImage } from '../geometry/frame';
import { sampleAt } from '../image/gray';
import type { GrayImage } from '../image/gray';
import { otsuThreshold } from '../image/otsu';
import type { Centre } from './finder';

/** Sub-samples per module, per axis. Three is enough to shrug off one bad pixel. */
const SUB = 3;

/**
 * The symbol as modules, from the three finder centres and the module count.
 *
 * The centres are 3.5 modules in from each edge of the symbol, so the top-left
 * and top-right centres are `size - 7` modules apart, and the two vectors
 * between them are the module grid's own axes. A finder pattern spans modules 0
 * to 6, so its centre is the centre of module 3 and the offset from it to
 * module `column` is `column - 3` modules.
 */
export function readModules(
  image: GrayImage,
  frame: Frame,
  corner: Centre,
  right: Centre,
  down: Centre,
  size: number,
): QrMatrix | null {
  const step = size - 7;
  if (step <= 0) return null;

  // The printed code is an axis aligned rectangle on the sheet, and this frame
  // IS sheet space, so the module grid's axes are the frame's axes. Only the
  // pitch is measured. Taking the full vectors between the finder centres would
  // fold each centre's own measurement noise into the grid as a small rotation,
  // and over twenty two modules that walks the far corner off its module: it
  // showed up as a payload that passed its own error correction and decoded to
  // the wrong text.
  const ex = { xMm: (right.xMm - corner.xMm) / step, yMm: 0 };
  const ey = { xMm: 0, yMm: (down.yMm - corner.yMm) / step };

  const values: number[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let sum = 0;
      for (let sy = 0; sy < SUB; sy += 1) {
        for (let sx = 0; sx < SUB; sx += 1) {
          // Sub-sample offsets stay inside the middle of the module so that a
          // neighbouring module never leaks into this one's value.
          const offsetX = column - 3 + (sx - (SUB - 1) / 2) / (SUB + 1);
          const offsetY = row - 3 + (sy - (SUB - 1) / 2) / (SUB + 1);
          const xMm = corner.xMm + offsetX * ex.xMm + offsetY * ey.xMm;
          const yMm = corner.yMm + offsetX * ex.yMm + offsetY * ey.yMm;
          const at = toImage(frame, xMm, yMm);
          sum += sampleAt(image, at.x, at.y);
        }
      }
      values.push(sum / (SUB * SUB));
    }
  }

  const cut = otsuThreshold(values);
  if (cut === null) return null;

  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (values[row * size + column] ?? 255) <= cut),
  );
}
