// Primitive drawing calls. Each returns one line of Typst source.
//
// Typst places content by the top left corner of its box, so anything that is
// specified by a centre or a baseline is converted here rather than at every
// call site.
//
// Each line is emitted **without a leading hash**, because the sheet is built
// as a Typst value inside a code block and placed from there. That is what lets
// one sheet be laid on a page more than once without emitting it twice.

import type { Rect } from '@transferchecker/sheet-spec';
import { color, mm, pt, str } from './typst-value';

/**
 * Fraction of the type size that sits above the baseline. Used to convert the
 * layout's baseline anchors into the top edge Typst expects. Tuned for the
 * Plex family; label placement is visual, only bubbles and fiducials are
 * measured against by the scanner.
 */
const ASCENT_RATIO = 0.78;

/** Points per millimetre, for converting type sizes expressed in mm. */
const PT_PER_MM = 72 / 25.4;

export type HorizontalAlign = 'left' | 'center' | 'right';

export function filledRect(box: Rect, fill: string): string {
  return `place(dx: ${mm(box.xMm)}, dy: ${mm(box.yMm)}, rect(width: ${mm(box.wMm)}, height: ${mm(box.hMm)}, fill: ${color(fill)}, stroke: none))`;
}

export function strokedRect(box: Rect, strokeMm: number, stroke: string): string {
  return `place(dx: ${mm(box.xMm)}, dy: ${mm(box.yMm)}, rect(width: ${mm(box.wMm)}, height: ${mm(box.hMm)}, fill: none, stroke: ${mm(strokeMm)} + ${color(stroke)}))`;
}

/** An unfilled bubble, positioned by its centre. */
export function bubble(
  cxMm: number,
  cyMm: number,
  rMm: number,
  strokeMm: number,
  stroke: string,
): string {
  return `place(dx: ${mm(cxMm - rMm)}, dy: ${mm(cyMm - rMm)}, circle(radius: ${mm(rMm)}, fill: none, stroke: ${mm(strokeMm)} + ${color(stroke)}))`;
}

/** A symbol centred inside a bubble, so the box matches the bubble exactly. */
export function bubbleLabel(
  cxMm: number,
  cyMm: number,
  rMm: number,
  sizeMm: number,
  fill: string,
  value: string,
): string {
  const side = mm(rMm * 2);
  const content = `align(center + horizon, text(size: ${pt(sizeMm * PT_PER_MM)}, fill: ${color(fill)}, ${str(value)}))`;
  return `place(dx: ${mm(cxMm - rMm)}, dy: ${mm(cyMm - rMm)}, box(width: ${side}, height: ${side}, ${content}))`;
}

/**
 * Text on a baseline. `widthMm` gives the box the alignment resolves within,
 * which is how a question number ends up right aligned against its bubbles.
 */
export function textAt(
  xMm: number,
  baselineYMm: number,
  sizeMm: number,
  fill: string,
  value: string,
  options: { readonly align?: HorizontalAlign; readonly widthMm?: number } = {},
): string {
  const align = options.align ?? 'left';
  const boxWidthMm = options.widthMm ?? 0;
  const left =
    align === 'right' ? xMm - boxWidthMm : align === 'center' ? xMm - boxWidthMm / 2 : xMm;
  const top = baselineYMm - sizeMm * ASCENT_RATIO;
  const body = `text(size: ${pt(sizeMm * PT_PER_MM)}, fill: ${color(fill)}, ${str(value)})`;
  if (boxWidthMm === 0) {
    return `place(dx: ${mm(left)}, dy: ${mm(top)}, ${body})`;
  }
  return `place(dx: ${mm(left)}, dy: ${mm(top)}, box(width: ${mm(boxWidthMm)}, align(${align}, ${body})))`;
}

/** Text rotated to run along a band, centred on the band's long axis. */
export function textInBand(
  band: Rect,
  rotationDeg: number,
  sizeMm: number,
  fill: string,
  value: string,
): string {
  // The unrotated box runs along the band's long axis, then turns to fill it.
  const longMm = band.hMm;
  const shortMm = band.wMm;
  const centreXMm = band.xMm + band.wMm / 2;
  const centreYMm = band.yMm + band.hMm / 2;
  const content = `align(center + horizon, text(size: ${pt(sizeMm * PT_PER_MM)}, fill: ${color(fill)}, ${str(value)}))`;
  const boxed = `box(width: ${mm(longMm)}, height: ${mm(shortMm)}, ${content})`;
  return `place(dx: ${mm(centreXMm - longMm / 2)}, dy: ${mm(centreYMm - shortMm / 2)}, rotate(${String(rotationDeg)}deg, origin: center, ${boxed}))`;
}
