// Giving a compiled SVG its real physical size.
//
// Typst writes the root width and height as bare numbers of points, and a
// browser reads a bare number as pixels. An A4 sheet therefore arrives as
// 596x842 pixels, which prints at 157mm wide instead of 210mm: every bubble a
// quarter too small, and a sheet the scanner cannot read.
//
// The fix is to state the size in millimetres, which is what the sheet was laid
// out in to begin with.

import type { PaperSize } from '@transferchecker/sheet-spec';

const ROOT = /<svg\b([^>]*)>/;
const WIDTH = /\swidth="[^"]*"/;
const HEIGHT = /\sheight="[^"]*"/;

/**
 * Throws when the root tag is not what this function was written against,
 * because silently returning an SVG that still prints a quarter too small is
 * the failure this exists to prevent.
 */
export function withPhysicalSize(svg: string, paper: PaperSize): string {
  const attributes = ROOT.exec(svg)?.[1];
  if (attributes === undefined) {
    throw new Error('no root svg element, so its printed size cannot be corrected');
  }
  if (!WIDTH.test(attributes) || !HEIGHT.test(attributes)) {
    throw new Error('root svg element carries no width and height to correct');
  }

  const corrected = attributes
    .replace(WIDTH, ` width="${String(paper.widthMm)}mm"`)
    .replace(HEIGHT, ` height="${String(paper.heightMm)}mm"`);
  return svg.replace(ROOT, `<svg${corrected}>`);
}
