// Summed area table, and the adaptive threshold built on it.
//
// The corner squares have to be found under a shadow that can be darker on one
// side of the page than the paper is on the other, so a single global cut
// cannot separate ink from paper. A local mean can, and an integral image makes
// every local mean a constant time lookup no matter how large the window.

import type { GrayImage } from './gray';

export interface Integral {
  readonly width: number;
  readonly height: number;
  /** (width + 1) by (height + 1), so the origin row and column are zero. */
  readonly sums: Float64Array;
}

export function integralOf(image: GrayImage): Integral {
  const { width, height } = image;
  const sums = new Float64Array((width + 1) * (height + 1));
  const span = width + 1;

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    const source = y * image.stride;
    const target = (y + 1) * span;
    const above = y * span;
    for (let x = 0; x < width; x += 1) {
      rowSum += image.data[source + x] ?? 0;
      sums[target + x + 1] = (sums[above + x + 1] ?? 0) + rowSum;
    }
  }
  return { width, height, sums };
}

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/** Sum over the inclusive box, clipped to the image. */
export function boxSum(
  integral: Integral,
  left: number,
  top: number,
  right: number,
  bottom: number,
): number {
  const span = integral.width + 1;
  const x0 = clamp(left, 0, integral.width);
  const y0 = clamp(top, 0, integral.height);
  const x1 = clamp(right + 1, 0, integral.width);
  const y1 = clamp(bottom + 1, 0, integral.height);
  if (x1 <= x0 || y1 <= y0) return 0;

  const a = integral.sums[y1 * span + x1] ?? 0;
  const b = integral.sums[y0 * span + x1] ?? 0;
  const c = integral.sums[y1 * span + x0] ?? 0;
  const d = integral.sums[y0 * span + x0] ?? 0;
  return a - b - c + d;
}

export function boxMean(
  integral: Integral,
  left: number,
  top: number,
  right: number,
  bottom: number,
): number {
  const span = integral.width + 1;
  const x0 = clamp(left, 0, integral.width);
  const y0 = clamp(top, 0, integral.height);
  const x1 = clamp(right + 1, 0, integral.width);
  const y1 = clamp(bottom + 1, 0, integral.height);
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return 0;

  const a = integral.sums[y1 * span + x1] ?? 0;
  const b = integral.sums[y0 * span + x1] ?? 0;
  const c = integral.sums[y1 * span + x0] ?? 0;
  const d = integral.sums[y0 * span + x0] ?? 0;
  return (a - b - c + d) / area;
}

/** A pixel mask: 1 where the image is ink, 0 where it is paper. */
export interface Mask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * Marks a pixel as ink when it is darker than the mean of the window around it
 * by more than `bias`. The window is a fraction of the image rather than a
 * fixed pixel count so that the same code behaves the same on a 1080p frame and
 * on a 300 dpi scan, and the bias keeps flat paper from turning into noise.
 */
export function adaptiveInk(image: GrayImage, windowFraction = 0.06, bias = 12): Mask {
  const integral = integralOf(image);
  const radius = Math.max(
    4,
    Math.round((Math.min(image.width, image.height) * windowFraction) / 2),
  );
  const data = new Uint8Array(image.width * image.height);

  for (let y = 0; y < image.height; y += 1) {
    const source = y * image.stride;
    const target = y * image.width;
    for (let x = 0; x < image.width; x += 1) {
      const value = image.data[source + x] ?? 0;
      const mean = boxMean(integral, x - radius, y - radius, x + radius, y + radius);
      data[target + x] = value + bias < mean ? 1 : 0;
    }
  }
  return { width: image.width, height: image.height, data };
}
