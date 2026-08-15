// The only image this engine knows about: one byte of luminance per pixel.
//
// A camera frame arrives as YUV and its Y plane is exactly this, so a phone
// hands over a view rather than a conversion. A stride is carried because that
// plane is padded on most devices, and copying it into a packed buffer once per
// frame is the kind of cost that only shows up as a dropped frame.
//
// 0 is black and 255 is white, which is the direction paper reads in: a blank
// sheet is a high number and ink is a low one.

export interface GrayImage {
  readonly width: number;
  readonly height: number;
  /** Bytes from the start of one row to the start of the next. */
  readonly stride: number;
  readonly data: Uint8Array;
}

export function createGray(width: number, height: number, fill = 255): GrayImage {
  const data = new Uint8Array(width * height);
  if (fill !== 0) data.fill(fill);
  return { width, height, stride: width, data };
}

/** Null for a plane that cannot hold the size it claims. */
export function wrapGray(
  data: Uint8Array,
  width: number,
  height: number,
  stride: number = width,
): GrayImage | null {
  if (width <= 0 || height <= 0 || stride < width) return null;
  if (data.length < stride * (height - 1) + width) return null;
  return { width, height, stride, data };
}

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/** Nearest pixel, with coordinates clamped to the edge rather than wrapping. */
export function pixelAt(image: GrayImage, x: number, y: number): number {
  const column = clamp(Math.round(x), 0, image.width - 1);
  const row = clamp(Math.round(y), 0, image.height - 1);
  return image.data[row * image.stride + column] ?? 0;
}

export function setPixel(image: GrayImage, x: number, y: number, value: number): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  image.data[y * image.stride + x] = clamp(Math.round(value), 0, 255);
}

/**
 * Bilinear sample.
 *
 * Nearest neighbour would be cheaper and is the wrong trade here: a bubble is
 * sampled on a lattice fixed in millimetres, so a hundredth of a millimetre of
 * camera shake moves every sample point by a fraction of a pixel. Under nearest
 * neighbour that fraction snaps whole pixels in and out of the average and the
 * fill ratio jitters, which is exactly the irreproducibility acceptance
 * criterion 12 forbids.
 */
export function sampleAt(image: GrayImage, x: number, y: number): number {
  const fx = clamp(x, 0, image.width - 1);
  const fy = clamp(y, 0, image.height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, image.width - 1);
  const y1 = Math.min(y0 + 1, image.height - 1);
  const ax = fx - x0;
  const ay = fy - y0;

  const row0 = y0 * image.stride;
  const row1 = y1 * image.stride;
  const p00 = image.data[row0 + x0] ?? 0;
  const p10 = image.data[row0 + x1] ?? 0;
  const p01 = image.data[row1 + x0] ?? 0;
  const p11 = image.data[row1 + x1] ?? 0;

  const top = p00 + (p10 - p00) * ax;
  const bottom = p01 + (p11 - p01) * ax;
  return top + (bottom - top) * ay;
}

export function isInside(image: GrayImage, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x <= image.width - 1 && y <= image.height - 1;
}
