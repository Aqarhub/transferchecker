// Drawing primitives for the synthetic sheet generator.
//
// This is test scaffolding, not product code, and it lives outside src for that
// reason. It still matters: docs/FAILURE-MODES.md section 4ب-10 makes the
// synthetic mark generator the first thing to build, because it is what lets
// the engine be written while the real paper is still being collected.
//
// Coverage is computed by sub-sampling each pixel rather than by snapping to
// whole pixels. A hard edged circle would make a bubble's ink area jump in
// steps of a whole pixel as it moves, and the tests that matter most here are
// exactly the ones that move a bubble by a fraction of a pixel.

import { createGray } from '../src/image/gray';
import type { GrayImage } from '../src/image/gray';

export { createGray };

/** Sub-samples per axis inside one pixel. */
const SUB = 4;

export interface RectMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly wMm: number;
  readonly hMm: number;
}

function blend(image: GrayImage, x: number, y: number, value: number, coverage: number): void {
  if (coverage <= 0 || x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const at = y * image.stride + x;
  const before = image.data[at] ?? 255;
  const alpha = Math.min(1, coverage);
  image.data[at] = Math.round(before * (1 - alpha) + value * alpha);
}

/**
 * Paints a shape over its bounding box in millimetres. `inside` is asked
 * whether a point in millimetres is covered, and is called once per sub-sample.
 */
function paint(
  image: GrayImage,
  pxPerMm: number,
  box: RectMm,
  value: number,
  inside: (xMm: number, yMm: number) => boolean,
): void {
  const left = Math.max(0, Math.floor(box.xMm * pxPerMm));
  const top = Math.max(0, Math.floor(box.yMm * pxPerMm));
  const right = Math.min(image.width - 1, Math.ceil((box.xMm + box.wMm) * pxPerMm));
  const bottom = Math.min(image.height - 1, Math.ceil((box.yMm + box.hMm) * pxPerMm));

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SUB; sy += 1) {
        const yMm = (y + (sy + 0.5) / SUB) / pxPerMm;
        for (let sx = 0; sx < SUB; sx += 1) {
          const xMm = (x + (sx + 0.5) / SUB) / pxPerMm;
          if (inside(xMm, yMm)) hits += 1;
        }
      }
      blend(image, x, y, value, hits / (SUB * SUB));
    }
  }
}

export function fillRect(image: GrayImage, pxPerMm: number, box: RectMm, value: number): void {
  paint(
    image,
    pxPerMm,
    box,
    value,
    (xMm, yMm) =>
      xMm >= box.xMm && xMm <= box.xMm + box.wMm && yMm >= box.yMm && yMm <= box.yMm + box.hMm,
  );
}

export function strokeRect(
  image: GrayImage,
  pxPerMm: number,
  box: RectMm,
  strokeMm: number,
  value: number,
): void {
  const half = strokeMm / 2;
  const outer: RectMm = {
    xMm: box.xMm - half,
    yMm: box.yMm - half,
    wMm: box.wMm + strokeMm,
    hMm: box.hMm + strokeMm,
  };
  paint(image, pxPerMm, outer, value, (xMm, yMm) => {
    const inOuter =
      xMm >= outer.xMm &&
      xMm <= outer.xMm + outer.wMm &&
      yMm >= outer.yMm &&
      yMm <= outer.yMm + outer.hMm;
    const inInner =
      xMm >= box.xMm + half &&
      xMm <= box.xMm + box.wMm - half &&
      yMm >= box.yMm + half &&
      yMm <= box.yMm + box.hMm - half;
    return inOuter && !inInner;
  });
}

export function fillCircle(
  image: GrayImage,
  pxPerMm: number,
  cxMm: number,
  cyMm: number,
  rMm: number,
  value: number,
): void {
  const box: RectMm = { xMm: cxMm - rMm, yMm: cyMm - rMm, wMm: 2 * rMm, hMm: 2 * rMm };
  paint(image, pxPerMm, box, value, (xMm, yMm) => Math.hypot(xMm - cxMm, yMm - cyMm) <= rMm);
}

export function strokeCircle(
  image: GrayImage,
  pxPerMm: number,
  cxMm: number,
  cyMm: number,
  rMm: number,
  strokeMm: number,
  value: number,
): void {
  const outer = rMm + strokeMm / 2;
  const inner = rMm - strokeMm / 2;
  const box: RectMm = { xMm: cxMm - outer, yMm: cyMm - outer, wMm: 2 * outer, hMm: 2 * outer };
  paint(image, pxPerMm, box, value, (xMm, yMm) => {
    const distance = Math.hypot(xMm - cxMm, yMm - cyMm);
    return distance <= outer && distance >= inner;
  });
}

/** An annulus of ink, which is how a rubbed out pencil mark actually looks. */
export function fillRing(
  image: GrayImage,
  pxPerMm: number,
  cxMm: number,
  cyMm: number,
  innerMm: number,
  outerMm: number,
  value: number,
): void {
  const box: RectMm = {
    xMm: cxMm - outerMm,
    yMm: cyMm - outerMm,
    wMm: 2 * outerMm,
    hMm: 2 * outerMm,
  };
  paint(image, pxPerMm, box, value, (xMm, yMm) => {
    const distance = Math.hypot(xMm - cxMm, yMm - cyMm);
    return distance <= outerMm && distance >= innerMm;
  });
}
