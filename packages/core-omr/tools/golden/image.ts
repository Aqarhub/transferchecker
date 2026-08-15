// Turning one golden case into the image the engine will see.
//
// The order of the steps is the order the physical world applies them, and it
// is not interchangeable: the sheet is printed, the student marks it, something
// happens to the paper, and only then is it photographed. Applying a curl after
// the camera would model a bent photograph rather than a bent sheet.
//
// Rendering is cached on everything that decides the printed page, because the
// answered fraction sweep alone would otherwise redraw a hundred question sheet
// eight times at [measured] 1.9 seconds each.

import { GEOMETRY } from '@transferchecker/sheet-spec';
import { createGray } from '../../src/image/gray';
import type { GrayImage } from '../../src/image/gray';
import { bendSheet } from '../bend';
import { photograph } from '../photograph';
import { scalePrint } from '../print';
import { DEFAULT_INK, renderSheet } from '../render';
import type { GoldenCase } from './corpus';
import { sheetOf } from './corpus';

const DEFAULT_PX_PER_MM = 8;

const RENDERS = new Map<string, GrayImage>();

const renderKey = (item: GoldenCase): string =>
  JSON.stringify([item.template, item.pxPerMm ?? DEFAULT_PX_PER_MM, item.ink ?? null, item.marks]);

/** The printed page with the student's marks on it, before anything happens to it. */
function pageOf(item: GoldenCase): GrayImage {
  const key = renderKey(item);
  const held = RENDERS.get(key);
  if (held !== undefined) return held;

  const { layout } = sheetOf(item.template);
  const made = renderSheet(layout, {
    pxPerMm: item.pxPerMm ?? DEFAULT_PX_PER_MM,
    ink: item.ink ?? DEFAULT_INK,
    marks: item.marks,
  });
  RENDERS.set(key, made);
  return made;
}

/** A pen line down the margin, which is what takes a timing mark away. */
function coverRows(image: GrayImage, item: GoldenCase, pxPerMm: number): GrayImage {
  const rows = item.coverRows ?? [];
  if (rows.length === 0) return image;

  const { layout } = sheetOf(item.template);
  const paper = (item.ink ?? DEFAULT_INK).paper;
  const out = createGray(image.width, image.height, paper);
  out.data.set(image.data);

  for (const row of rows) {
    const rect = layout.timingMarks[row];
    if (rect === undefined) continue;
    const x0 = Math.max(0, Math.round((rect.xMm - 1) * pxPerMm));
    const x1 = Math.min(out.width - 1, Math.round((rect.xMm + rect.wMm + 1) * pxPerMm));
    const y0 = Math.max(0, Math.round((rect.yMm - 1) * pxPerMm));
    const y1 = Math.min(out.height - 1, Math.round((rect.yMm + rect.hMm + 1) * pxPerMm));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) out.data[y * out.stride + x] = paper;
    }
  }
  return out;
}

/** Two copies of the sheet on one carrier, side by side, as the 2 up path prints. */
function tileTwoUp(image: GrayImage, pxPerMm: number, paper: number): GrayImage {
  const gapMm = 1;
  const carrier = createGray(image.width * 2 + Math.round(gapMm * pxPerMm), image.height, paper);
  for (const originX of [0, image.width + Math.round(gapMm * pxPerMm)]) {
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const target = originX + x;
        if (target >= carrier.width) continue;
        carrier.data[y * carrier.stride + target] = image.data[y * image.stride + x] ?? paper;
      }
    }
  }
  return carrier;
}

export function imageOf(item: GoldenCase): GrayImage {
  const pxPerMm = item.pxPerMm ?? DEFAULT_PX_PER_MM;
  const paper = (item.ink ?? DEFAULT_INK).paper;
  const { layout } = sheetOf(item.template);

  let image = coverRows(pageOf(item), item, pxPerMm);

  if (item.bendMm !== undefined && item.bendMm !== 0) {
    const firstRow = layout.questionColumns[0]?.rows[0]?.numberAnchor.yMm ?? 60;
    image = bendSheet(image, {
      pxPerMm,
      bulgeMm: item.bendMm,
      leftMm: GEOMETRY.marginSideMm + GEOMETRY.fiducialMm / 2,
      rightMm: layout.paper.widthMm - GEOMETRY.marginSideMm - GEOMETRY.fiducialMm / 2,
      fromYMm: firstRow - 12,
    });
  }

  if (item.printScale !== undefined && item.printScale !== 1) {
    image = scalePrint(image, item.printScale, paper);
  }

  if (item.twoUp === true) image = tileTwoUp(image, pxPerMm, paper);

  if (item.photo === undefined) return image;

  // The camera is given the size of the PAPER, not of the content. A page
  // printed at 96 percent is the same sheet of paper with a smaller sheet drawn
  // on it, which is exactly why a print scale is invisible to everything except
  // a ruler, and `scalePrint` models it that way.
  const widthMm = layout.paper.widthMm * (item.twoUp === true ? 2 : 1);
  return photograph(image, widthMm, layout.paper.heightMm, item.photo);
}

/** Frees the render cache, which a long sweep would otherwise hold whole. */
export function forgetRenders(): void {
  RENDERS.clear();
}

export { DEFAULT_PX_PER_MM };
