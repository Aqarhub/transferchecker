// A laid out sheet, drawn as a flat grey image in paper space.
//
// This is the golden set before there is a golden set. It draws what the PDF
// generator draws, from the same layout object, so a sheet rendered here has
// its corner squares, timing marks, printed code and bubbles at exactly the
// millimetres the scanner is going to look for.
//
// What it does NOT draw is text the scanner must not depend on: the question
// number, the branding, the printed warning. Leaving those out keeps the claim
// honest, because a scanner that quietly needed them would still pass.
//
// The one piece of text it DOES draw is the letter printed inside each bubble,
// and that is not a decoration. `placement: 'internal'` is the default, so on
// almost every real sheet every empty bubble already carries ink in exactly the
// place the fill ratio is measured: the middle. Omitting it proves the absolute
// ink floor against a cleaner sheet than any teacher will ever print.

import type { SheetLayout } from '@transferchecker/sheet-spec';
import { bubbleGroups } from '@transferchecker/sheet-spec';
import type { GrayImage } from '../src/image/gray';
import { createGray, fillCircle, fillRect, fillRing, strokeCircle, strokeRect } from './raster';

export interface Ink {
  /** Paper white. Real paper photographs closer to 240 than to 255. */
  readonly paper: number;
  /** Solid printed ink: the corner squares, the timing marks, the code. */
  readonly ink: number;
  /** The bubble outline, printed light so an empty bubble reads as paper. */
  readonly bubbleStroke: number;
  readonly bubbleStrokeMm: number;
  readonly boxStroke: number;
  readonly boxStrokeMm: number;
  /** The letter printed inside a bubble, kept light so an empty bubble reads as paper. */
  readonly bubbleLabel: number;
  /**
   * Ink area of one printed letter, in square millimetres.
   *
   * A letter is strokes rather than a block, and the engine measures a mean, so
   * what matters is how much ink lands inside the disc and not the shape of it.
   *
   * 0.90 mm2 is the PESSIMISTIC end, not the typical one: a '0' at 1.9 mm cap
   * height, about 1.3 mm wide with a 0.22 mm stroke, covers roughly that much,
   * which is 12.7 percent of the 1.5 mm inner disc. Denser glyphs like '8' and
   * 'W' are the reason to sit at this end rather than at the 9 percent an
   * average letter gives. There is no rasteriser in this repository to measure
   * it against, so the number is reasoned rather than measured, and the test
   * asserts the margin it leaves so that being wrong about it shows up as a
   * shrinking number instead of a passing test.
   */
  readonly bubbleLabelAreaMm2: number;
}

/**
 * Paper at 216 rather than at 250.
 *
 * docs/FAILURE-MODES.md section 4ب-7 says the exposure should be driven from the
 * sheet so paper lands between 200 and 220, because a reflected light meter
 * aiming for mid grey pulls a near white page down and squeezes the grey band
 * every confidence decision is made in. Rendering paper at 248 would model a
 * page already at the sensor's ceiling, which is both unrealistic and the one
 * condition under which glare is undetectable, so it would quietly make the
 * glare tests pass for the wrong reason. The whole palette is scaled to match.
 */
export const DEFAULT_INK: Ink = {
  paper: 216,
  ink: 20,
  // The generator prints the outline at #8c9196, whose luminance is about 145,
  // which lands near 126 once the page is exposed to put paper at 216.
  bubbleStroke: 126,
  bubbleStrokeMm: 0.25,
  boxStroke: 36,
  boxStrokeMm: 0.35,
  // The generator prints the letter in the same grey as the outline.
  bubbleLabel: 126,
  bubbleLabelAreaMm2: 0.9,
};

/** One pencil mark a student made, aimed at one bubble of one group. */
export interface PencilMark {
  readonly groupId: string;
  readonly symbol: string;
  /** Fraction of the bubble radius the graphite covers. 1 is a full shading. */
  readonly coverage: number;
  /** Grey value of the graphite. A hard pencil leaves 120, a soft one 40. */
  readonly value: number;
  /** How far the mark sits off the bubble centre. */
  readonly offsetXMm?: number;
  readonly offsetYMm?: number;
  /**
   * Draws the mark as a ring instead of a disc, which is what a rubbed out
   * answer leaves: the middle comes clean and the rim does not.
   */
  readonly erased?: boolean;
}

export interface RenderOptions {
  readonly pxPerMm?: number;
  readonly ink?: Ink;
  readonly marks?: readonly PencilMark[];
  /** Draws the header and sidebar frames. On by default, since the sheet has them. */
  readonly furniture?: boolean;
  /** Draws the letter inside each bubble. On by default, since the sheet has it. */
  readonly labels?: boolean;
}

function drawFurniture(image: GrayImage, pxPerMm: number, layout: SheetLayout, ink: Ink): void {
  for (const field of layout.writtenFields) {
    strokeRect(image, pxPerMm, field.box, ink.boxStrokeMm, ink.boxStroke);
  }
  for (const field of layout.gridFields) {
    strokeRect(image, pxPerMm, field.frame, ink.boxStrokeMm, ink.boxStroke);
    for (const box of field.writeBoxes) {
      strokeRect(image, pxPerMm, box, ink.boxStrokeMm, ink.boxStroke);
    }
  }
}

function drawCode(image: GrayImage, pxPerMm: number, layout: SheetLayout, ink: Ink): void {
  const { box, modules } = layout.code;
  const size = modules.length;
  if (size === 0) return;
  // The quiet zone is part of the printed box, so the modules occupy the middle
  // of it and the module pitch follows from that rather than from the box.
  const moduleMm = box.wMm / (size + 8);
  const originXMm = box.xMm + 4 * moduleMm;
  const originYMm = box.yMm + 4 * moduleMm;

  for (const [row, line] of modules.entries()) {
    for (const [column, dark] of line.entries()) {
      if (!dark) continue;
      fillRect(
        image,
        pxPerMm,
        {
          xMm: originXMm + column * moduleMm,
          yMm: originYMm + row * moduleMm,
          wMm: moduleMm,
          hMm: moduleMm,
        },
        ink.ink,
      );
    }
  }
}

/** Draws a sheet exactly as it would print, flat and square on. */
export function renderSheet(layout: SheetLayout, options: RenderOptions = {}): GrayImage {
  const pxPerMm = options.pxPerMm ?? 8;
  const ink = options.ink ?? DEFAULT_INK;
  const image = createGray(
    Math.round(layout.paper.widthMm * pxPerMm),
    Math.round(layout.paper.heightMm * pxPerMm),
    ink.paper,
  );

  for (const rect of layout.fiducials) fillRect(image, pxPerMm, rect, ink.ink);
  for (const rect of layout.timingMarks) fillRect(image, pxPerMm, rect, ink.ink);
  drawCode(image, pxPerMm, layout, ink);
  if (options.furniture !== false) drawFurniture(image, pxPerMm, layout, ink);

  const groups = bubbleGroups(layout);
  for (const group of groups) {
    for (const bubble of group.bubbles) {
      strokeCircle(
        image,
        pxPerMm,
        bubble.cxMm,
        bubble.cyMm,
        bubble.rMm,
        ink.bubbleStrokeMm,
        ink.bubbleStroke,
      );
    }
  }

  // The letter inside the bubble, wherever the layout says one is printed.
  // Drawn as its ink area rather than as a glyph, because the engine measures a
  // mean over the disc and a real letter's shape does not change that mean.
  if (options.labels !== false) {
    const side = Math.sqrt(ink.bubbleLabelAreaMm2);
    for (const column of layout.questionColumns) {
      for (const row of column.rows) {
        if (!row.symbolsInBubbles) continue;
        for (const bubble of row.bubbles) {
          fillRect(
            image,
            pxPerMm,
            {
              xMm: bubble.cxMm - side / 2,
              yMm: bubble.cyMm - side / 2,
              wMm: side,
              hMm: side,
            },
            ink.bubbleLabel,
          );
        }
      }
    }
  }

  for (const mark of options.marks ?? []) {
    const group = groups.find((candidate) => candidate.id === mark.groupId);
    const bubble = group?.bubbles.find((candidate) => candidate.symbol === mark.symbol);
    if (bubble === undefined) continue;
    const cx = bubble.cxMm + (mark.offsetXMm ?? 0);
    const cy = bubble.cyMm + (mark.offsetYMm ?? 0);
    const radius = bubble.rMm * Math.max(0, Math.min(1.4, mark.coverage));
    if (radius <= 0) continue;
    if (mark.erased === true) {
      fillRing(image, pxPerMm, cx, cy, radius * 0.55, radius, mark.value);
    } else {
      fillCircle(image, pxPerMm, cx, cy, radius, mark.value);
    }
  }

  return image;
}
