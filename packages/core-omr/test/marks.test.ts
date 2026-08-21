// The shapes a real person actually draws, which are not the shape we drew.
//
// Every synthetic case in this package shades a bubble: `render.ts` paints a
// disc, so the corpus was a corpus of discs, and the engine was tuned against a
// mark nobody makes. The first four photographed sheets carried loops traced on
// the printed circle and single diagonal slashes, and the engine read a good
// share of them as untouched paper.
//
// So the cases here are drawn from the paper rather than from the renderer's
// vocabulary. They are their own file because they are about the MARK, while
// defenses.test.ts is about the sheet and the light.

import { describe, expect, it } from 'vitest';
import { bubbleGroups, layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import type { SheetLayout } from '@transferchecker/sheet-spec';
import { scanSheet } from '../src/scan/pipeline';
import type { ScanResult } from '../src/scan/result';
import { renderSheet } from '../tools/render';
import { fillRing } from '../tools/raster';
import type { GrayImage } from '../src/image/gray';

const TEXT = {
  name: 'Quick 20',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

const PX = 12;

/** A blue ballpoint on white office paper, as a grey level. */
const PEN = 60;

function sheetOf(kind: 'quick20' | 'full100'): SheetLayout {
  const result = layoutSheet(stockTemplate(kind, TEXT));
  if (result.kind !== 'ok') throw new Error(`layout failed for ${kind}`);
  return result.layout;
}

/**
 * A traced loop: a pen stroke of `strokeMm` running around the bubble at `atR`
 * times its radius.
 *
 * `render.ts` cannot draw this. Its `erased` mark is a ring from 0.55 r to r,
 * which is a thick rubbed out smear, not a line a pen makes.
 */
function traceLoop(
  image: GrayImage,
  layout: SheetLayout,
  question: number,
  symbol: string,
  atR: number,
  strokeMm: number,
): void {
  const group = bubbleGroups(layout).find((entry) => entry.id === `q:${String(question)}`);
  const bubble = group?.bubbles.find((entry) => entry.symbol === symbol);
  if (bubble === undefined) throw new Error(`no bubble q${String(question)} ${symbol}`);
  const mid = bubble.rMm * atR;
  fillRing(image, PX, bubble.cxMm, bubble.cyMm, mid - strokeMm / 2, mid + strokeMm / 2, PEN);
}

const graded = (result: ScanResult): ScanResult & { kind: 'ok' } => {
  if (result.kind !== 'ok') throw new Error(`refused: ${result.reason.kind}`);
  return result;
};

/** One loop on one otherwise untouched sheet, and what the engine said about it. */
function readLoop(atR: number, strokeMm: number): { outcome: string; mark: string } {
  // ONE LOOP PER SHEET, deliberately. `referenceAt` builds the paper white and
  // the toner black from the page around each bubble, so twenty loops on one
  // page move the reference the twenty-first is measured against. A sweep that
  // ignores that reports its own crosstalk as an engine result. [measured] It
  // did: on a shared page one case appeared to regress, and on its own page it
  // did not move at all.
  const layout = sheetOf('quick20');
  const image = renderSheet(layout, { pxPerMm: PX });
  traceLoop(image, layout, 7, 'B', atR, strokeMm);
  const sheet = graded(scanSheet(image)).sheet;
  const outcome = sheet.questions.find((entry) => entry.question === 7)?.outcome;
  return {
    outcome:
      outcome === undefined ? 'missing' : outcome.kind === 'answer' ? outcome.symbol : outcome.kind,
    mark: sheet.marks[6] ?? '?',
  };
}

describe('a mark drawn at the edge of the bubble is still a mark', () => {
  it('reads a loop traced inside the printed circle', () => {
    // 0.8 of the radius is where a pen goes when somebody circles the letter
    // rather than shading it: inside the printed ring, and outside the 0.75 disc
    // that used to be the whole measurement. All four of these came back blank.
    for (const stroke of [0.4, 0.5, 0.6, 0.8]) {
      expect([stroke, readLoop(0.8, stroke).outcome]).toEqual([stroke, 'B']);
    }
  });

  it('never loses a loop in silence, even where it cannot read it', () => {
    // The residual, stated rather than hidden: a loop drawn ON the printed
    // circle is not separable from the circle by any mean, because the band that
    // holds it holds the print as well. What the engine may NOT do is drop it
    // without a word, and `b` is the character that means exactly that.
    for (const stroke of [0.4, 0.5, 0.6, 0.8]) {
      const { outcome, mark } = readLoop(0.9, stroke);
      expect([stroke, outcome === 'blank' && mark === 'b']).toEqual([stroke, false]);
    }
  });
});

describe('and a wider measurement may never invent a mark', () => {
  it('reads an untouched full100 as one hundred blank questions', () => {
    // The owner photographed a completely unmarked full100 as a negative
    // control, and it is the right one: full100 is the only template with the
    // DENSE metrics, so its rows are the closest together in the product and its
    // bubbles have the least paper around them. If widening the measured disc
    // could ever pull in a neighbour or a printed label, it would show here
    // first.
    const layout = sheetOf('full100');
    const sheet = graded(scanSheet(renderSheet(layout, { pxPerMm: PX }))).sheet;
    expect(sheet.questions).toHaveLength(100);
    const marked = sheet.questions.filter((entry) => entry.outcome.kind !== 'blank');
    expect(marked.map((entry) => entry.question)).toEqual([]);
    expect(sheet.marks).toBe('b'.repeat(100));
  });

  it('reads an untouched quick20 as twenty blank questions', () => {
    const layout = sheetOf('quick20');
    const sheet = graded(scanSheet(renderSheet(layout, { pxPerMm: PX }))).sheet;
    expect(sheet.marks).toBe('b'.repeat(20));
  });
});
