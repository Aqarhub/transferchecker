// Connected components of an ink mask.
//
// The flood fill is iterative with its own stack. Recursion would be shorter
// and would blow the JavaScript stack on the first large dark region, which on
// a photograph is a shadow rather than an exceptional case.

import type { Mask } from './integral';

export interface Blob {
  readonly area: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /** Centre of mass of the ink, which is sub-pixel and is what gets used. */
  readonly cx: number;
  readonly cy: number;
}

export const blobWidth = (blob: Blob): number => blob.maxX - blob.minX + 1;
export const blobHeight = (blob: Blob): number => blob.maxY - blob.minY + 1;

/** Ink area over bounding box area. A solid square is near one, an outline is low. */
export const solidity = (blob: Blob): number => blob.area / (blobWidth(blob) * blobHeight(blob));

/** Longer side over shorter side, so a square is one and a bar is two or more. */
export const aspect = (blob: Blob): number => {
  const w = blobWidth(blob);
  const h = blobHeight(blob);
  return w >= h ? w / h : h / w;
};

/**
 * Every connected run of ink, eight connected. Components smaller than
 * `minArea` are dropped inside the scan rather than after it, because a
 * photograph of paper carries thousands of single pixel specks and collecting
 * them all is most of the cost of this function.
 */
export function findBlobs(mask: Mask, minArea = 8): Blob[] {
  const { width, height, data } = mask;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const blobs: Blob[] = [];

  for (let start = 0; start < data.length; start += 1) {
    if (data[start] !== 1 || seen[start] === 1) continue;

    seen[start] = 1;
    stack.push(start);
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (stack.length > 0) {
      const at = stack.pop();
      if (at === undefined) break;
      const x = at % width;
      const y = (at - x) / width;

      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (data[next] !== 1 || seen[next] === 1) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }

    if (area < minArea || maxX < 0) continue;
    blobs.push({ area, minX, minY, maxX, maxY, cx: sumX / area, cy: sumY / area });
  }

  return blobs;
}
