// Box downscale by a whole number factor.
//
// This exists to FIND the sheet and for nothing else. Defense د11 in
// docs/FAILURE-MODES.md is the reason it is stated so bluntly: the pipeline as
// the plan first sketched it shrank the frame to a quarter and then decoded the
// printed code from the result, which at a 0.5 mm module and a 1080 pixel frame
// is 0.64 pixels per module against the two a decoder needs. Every measurement
// in this package is taken from the frame at full resolution, and the only
// thing that comes off the small copy is where the corner squares are.
//
// A whole number factor is not a simplification. It makes each output pixel the
// mean of an exact block of input pixels, so the same frame always downscales
// to the same bytes and the search below it cannot drift between two runs.

import type { GrayImage } from './gray';
import { createGray } from './gray';

/** The smallest whole factor that brings the long side to `targetLongSide` or under. */
export function downscaleFactorFor(image: GrayImage, targetLongSide: number): number {
  const longSide = Math.max(image.width, image.height);
  if (targetLongSide <= 0) return 1;
  return Math.max(1, Math.floor(longSide / targetLongSide));
}

export function downscale(image: GrayImage, factor: number): GrayImage {
  if (factor <= 1) return image;

  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  if (width < 1 || height < 1) return image;

  const out = createGray(width, height, 0);
  const blockArea = factor * factor;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const row = (y * factor + dy) * image.stride + x * factor;
        for (let dx = 0; dx < factor; dx += 1) {
          sum += image.data[row + dx] ?? 0;
        }
      }
      out.data[y * out.stride + x] = Math.round(sum / blockArea);
    }
  }
  return out;
}
