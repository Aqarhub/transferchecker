// Reading geometry back out of the Typst source we emit.
//
// The scanner and the synthetic renderer both take their millimetres from
// `layoutSheet`, so a misunderstanding shared between them passes every test in
// `core-omr`: the engine would be measuring exactly where the renderer drew,
// and both would be wrong about where the PRINTER puts ink.
//
// This is the one independent artifact available without a rasteriser. The
// Typst source is plain text carrying explicit `place(dx: Xmm, dy: Ymm, ...)`
// lines, emitted by `draw.ts` and `render.ts`, which are a different code path
// written for a different purpose: one turns a layout into a printable page,
// the other turns a layout into a sample lattice. Parsing the text back and
// comparing it with the layout object closes the loop the samples opened.
//
// What it proves and what it does not: it proves that what we PRINT is what the
// layout SAYS, element by element and to a hundredth of a millimetre. It cannot
// prove that the layout is right about paper, because both sides of the
// comparison still come from `layoutSheet`. The independent check on that is a
// ruler on a printed page, which is defense د4 and needs a printer.

import { GEOMETRY, bubbleGroups } from '@transferchecker/sheet-spec';
import type { SheetLayout } from '@transferchecker/sheet-spec';

export interface TypRect {
  readonly xMm: number;
  readonly yMm: number;
  readonly wMm: number;
  readonly hMm: number;
  /** Six hex digits for a filled rectangle, null for an outlined one. */
  readonly fill: string | null;
}

export interface TypCircle {
  readonly cxMm: number;
  readonly cyMm: number;
  readonly rMm: number;
}

export interface TypSheet {
  readonly rects: readonly TypRect[];
  readonly circles: readonly TypCircle[];
}

const MM = String.raw`(-?[\d.]+)mm`;
const FILLED_RECT = new RegExp(
  String.raw`place\(dx: ${MM}, dy: ${MM}, rect\(width: ${MM}, height: ${MM}, fill: rgb\("#([0-9a-f]{6})"\)`,
  'g',
);
const STROKED_RECT = new RegExp(
  String.raw`place\(dx: ${MM}, dy: ${MM}, rect\(width: ${MM}, height: ${MM}, fill: none`,
  'g',
);
// A circle is placed by its bounding box, so the centre is the corner plus the
// radius. That conversion is the reason this file exists rather than a grep.
const CIRCLE = new RegExp(String.raw`place\(dx: ${MM}, dy: ${MM}, circle\(radius: ${MM}`, 'g');

const at = (match: RegExpMatchArray, index: number): number => Number(match[index]);

/**
 * Every rectangle and circle of ONE sheet, in that sheet's own millimetres.
 *
 * The body between `#let sheet = {` and its closing brace is the sheet drawn
 * once; the `#place` calls after it lay that same body on the page one or more
 * times. Reading the body rather than the whole file is what makes a two up
 * carrier and a single page parse to the same geometry.
 */
export function parseTypSheet(source: string): TypSheet {
  const start = source.indexOf('#let sheet = {');
  if (start < 0) return { rects: [], circles: [] };
  const end = source.indexOf('\n}\n', start);
  const body = source.slice(start, end < 0 ? undefined : end);

  const rects: TypRect[] = [
    ...[...body.matchAll(FILLED_RECT)].map((match) => ({
      xMm: at(match, 1),
      yMm: at(match, 2),
      wMm: at(match, 3),
      hMm: at(match, 4),
      fill: match[5] ?? null,
    })),
    ...[...body.matchAll(STROKED_RECT)].map((match) => ({
      xMm: at(match, 1),
      yMm: at(match, 2),
      wMm: at(match, 3),
      hMm: at(match, 4),
      fill: null,
    })),
  ];

  const circles: TypCircle[] = [...body.matchAll(CIRCLE)].map((match) => ({
    cxMm: at(match, 1) + at(match, 3),
    cyMm: at(match, 2) + at(match, 3),
    rMm: at(match, 3),
  }));

  return { rects, circles };
}

export interface GeometryDiff {
  /** Which kind of printed element this row is about. */
  readonly element: string;
  readonly expected: number;
  readonly found: number;
  /**
   * The largest distance in millimetres between an element the layout places
   * and the one the Typst source places at that position, or NaN when the two
   * do not even agree on how many there are.
   */
  readonly worstMm: number;
}

interface Placed {
  readonly xMm: number;
  readonly yMm: number;
  /** Radius for a bubble, so a wrong size fails as loudly as a wrong position. */
  readonly sizeMm: number;
}

/** Sorted so the comparison never depends on the order either side emits in. */
const ordered = (items: readonly Placed[]): Placed[] =>
  [...items].sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm || a.sizeMm - b.sizeMm);

function worstOf(fromTyp: readonly Placed[], fromLayout: readonly Placed[]): number {
  if (fromTyp.length !== fromLayout.length) return Number.NaN;
  const left = ordered(fromTyp);
  const right = ordered(fromLayout);
  let worst = 0;
  for (const [index, item] of left.entries()) {
    const other = right[index];
    if (other === undefined) return Number.NaN;
    const away =
      Math.hypot(item.xMm - other.xMm, item.yMm - other.yMm) + Math.abs(item.sizeMm - other.sizeMm);
    if (away > worst) worst = away;
  }
  return worst;
}

const solid = (rects: readonly TypRect[], wMm: number, hMm: number): Placed[] =>
  rects
    .filter(
      (rect) =>
        rect.fill !== null && Math.abs(rect.wMm - wMm) < 0.005 && Math.abs(rect.hMm - hMm) < 0.005,
    )
    .map((rect) => ({ xMm: rect.xMm, yMm: rect.yMm, sizeMm: rect.wMm }));

const boxes = (rects: readonly Rect[]): Placed[] =>
  rects.map((rect) => ({ xMm: rect.xMm, yMm: rect.yMm, sizeMm: rect.wMm }));

interface Rect {
  readonly xMm: number;
  readonly yMm: number;
  readonly wMm: number;
  readonly hMm: number;
}

/**
 * Every class of printed element, compared between the layout and the source.
 *
 * The classes are separated by their printed size rather than by their order in
 * the file, because the point is to catch an emitter that moves one KIND of
 * element: a timing mark drawn at the wrong height would still be the same
 * count of rectangles.
 */
export function geometryDiff(layout: SheetLayout, typ: TypSheet): GeometryDiff[] {
  const anchorMarks = layout.anchorColumns.flatMap((column) => column.marks);
  const bubbles = bubbleGroups(layout).flatMap((group) => group.bubbles);
  const codeAcross = layout.code.modules.length + 2 * GEOMETRY.codeQuietModules;
  const moduleMm = codeAcross === 0 ? 0 : layout.code.box.wMm / codeAcross;

  // The emitter overlaps neighbouring modules by a hairline so the printer does
  // not show a seam, so a module's drawn width is not its pitch.
  const modules = typ.rects.filter(
    (rect) => rect.fill !== null && rect.wMm < 2 && Math.abs(rect.wMm - rect.hMm) < 0.005,
  );
  const darkModules = layout.code.modules.flat().filter(Boolean).length;

  return [
    {
      element: 'fiducials',
      expected: layout.fiducials.length,
      found: solid(typ.rects, GEOMETRY.fiducialMm, GEOMETRY.fiducialMm).length,
      worstMm: worstOf(
        solid(typ.rects, GEOMETRY.fiducialMm, GEOMETRY.fiducialMm),
        boxes(layout.fiducials),
      ),
    },
    {
      element: 'timing marks',
      expected: layout.timingMarks.length,
      found: solid(typ.rects, GEOMETRY.timingWidthMm, GEOMETRY.timingHeightMm).length,
      worstMm: worstOf(
        solid(typ.rects, GEOMETRY.timingWidthMm, GEOMETRY.timingHeightMm),
        boxes(layout.timingMarks),
      ),
    },
    {
      element: 'anchor marks',
      expected: anchorMarks.length,
      found: solid(typ.rects, GEOMETRY.anchorWidthMm, GEOMETRY.timingHeightMm).length,
      worstMm: worstOf(
        solid(typ.rects, GEOMETRY.anchorWidthMm, GEOMETRY.timingHeightMm),
        boxes(anchorMarks),
      ),
    },
    {
      element: 'code modules',
      expected: darkModules,
      found: modules.length,
      worstMm:
        modules.length !== darkModules || moduleMm === 0
          ? Number.NaN
          : Math.max(
              0,
              ...modules.map((rect) => {
                // Back to a module index, and then to the millimetre the layout
                // says that module starts at.
                const column = Math.round((rect.xMm - layout.code.box.xMm) / moduleMm);
                const row = Math.round((rect.yMm - layout.code.box.yMm) / moduleMm);
                const expectedX = layout.code.box.xMm + column * moduleMm;
                const expectedY = layout.code.box.yMm + row * moduleMm;
                return Math.hypot(rect.xMm - expectedX, rect.yMm - expectedY);
              }),
            ),
    },
    {
      element: 'bubbles',
      expected: bubbles.length,
      found: typ.circles.length,
      worstMm: worstOf(
        typ.circles.map((circle) => ({ xMm: circle.cxMm, yMm: circle.cyMm, sizeMm: circle.rMm })),
        bubbles.map((bubble) => ({ xMm: bubble.cxMm, yMm: bubble.cyMm, sizeMm: bubble.rMm })),
      ),
    },
  ];
}
