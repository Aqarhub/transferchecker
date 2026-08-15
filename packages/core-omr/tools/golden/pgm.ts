// The on disk format of a real shot: binary PGM, and nothing else.
//
// The choice is the whole reason this file is short. A `GrayImage` is one byte
// of luminance per pixel, and a binary PGM is a nine byte header followed by
// one byte of luminance per pixel, so reading one is parsing four numbers. No
// JPEG decoder, no PNG decoder and no image library enters the trust path, and
// nothing between the photograph and the engine can silently resample, sharpen
// or gamma correct the pixels the accuracy number is computed from.
//
// The cost is paid honestly and is stated here rather than discovered later: a
// PGM is uncompressed, so a 1440 by 2560 shot is 3.7 MB and three hundred of
// them are about a gigabyte. That is why the bytes live outside the repository
// and the manifest carries their SHA-256 instead. See `manifest.ts`.

import { createGray } from '../../src/image/gray';
import type { GrayImage } from '../../src/image/gray';

const SPACE = new Set([0x20, 0x09, 0x0a, 0x0d]);
const HASH = 0x23;
const NEWLINE = 0x0a;

/** The four header tokens of a binary PGM, with comments skipped as the format allows. */
function header(bytes: Uint8Array): { tokens: string[]; at: number } {
  const tokens: string[] = [];
  let at = 0;
  while (tokens.length < 4 && at < bytes.length) {
    if (SPACE.has(bytes[at] ?? 0)) {
      at += 1;
    } else if (bytes[at] === HASH) {
      while (at < bytes.length && bytes[at] !== NEWLINE) at += 1;
    } else {
      const from = at;
      while (at < bytes.length && !SPACE.has(bytes[at] ?? 0)) at += 1;
      tokens.push(String.fromCharCode(...bytes.subarray(from, at)));
    }
  }
  return { tokens, at: at + 1 };
}

/** Null for anything that is not a binary PGM this engine can read as it stands. */
export function readPgm(bytes: Uint8Array): GrayImage | null {
  const { tokens, at } = header(bytes);
  const [magic, width, height, maxValue] = [
    tokens[0],
    Number(tokens[1]),
    Number(tokens[2]),
    Number(tokens[3]),
  ];
  if (magic !== 'P5' || !Number.isInteger(width) || !Number.isInteger(height)) return null;
  // A 16 bit PGM is a different byte layout, and scaling it here would be the
  // one silent conversion this format exists to avoid.
  if (maxValue !== 255 || width <= 0 || height <= 0) return null;
  if (bytes.length - at < width * height) return null;
  return { width, height, stride: width, data: bytes.subarray(at, at + width * height) };
}

/** The same image back out, packed, which is what `import-shot.ts` writes. */
export function writePgm(image: GrayImage): Uint8Array {
  const head = new TextEncoder().encode(
    `P5\n${String(image.width)} ${String(image.height)}\n255\n`,
  );
  const out = new Uint8Array(head.byteLength + image.width * image.height);
  out.set(head, 0);
  for (let y = 0; y < image.height; y += 1) {
    const row = image.data.subarray(y * image.stride, y * image.stride + image.width);
    out.set(row, head.byteLength + y * image.width);
  }
  return out;
}

/** A grey image built from raw packed bytes, for a converter that hands them over. */
export function grayFromRaw(data: Uint8Array, width: number, height: number): GrayImage | null {
  if (width <= 0 || height <= 0 || data.length < width * height) return null;
  const image = createGray(width, height, 0);
  image.data.set(data.subarray(0, width * height));
  return image;
}
