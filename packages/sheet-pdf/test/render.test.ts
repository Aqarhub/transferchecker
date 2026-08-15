import { describe, expect, it } from 'vitest';
import {
  GEOMETRY,
  arabicSymbols,
  bubbleGroups,
  decodeSheetCode,
  latinSymbols,
} from '@transferchecker/sheet-spec';
import type { SheetLayout } from '@transferchecker/sheet-spec';
import { renderSheetTypst } from '../src/index';
import { choiceQuestions, makeLayout, makeOptions } from './helpers';

const countOf = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0;

const questionBubbles = (layout: SheetLayout): number =>
  layout.questionColumns
    .flatMap((column) => column.rows)
    .reduce((total, row) => total + row.bubbles.length, 0);

const gridBubbles = (layout: SheetLayout): number =>
  layout.gridFields
    .flatMap((field) => field.columns)
    .reduce((total, column) => total + column.bubbles.length, 0);

describe('renderSheetTypst', () => {
  it('sets the page to the exact paper size with no margin', () => {
    const source = renderSheetTypst(makeLayout(), makeOptions());
    expect(source).toContain('#set page(width: 210mm, height: 297mm, margin: 0pt, fill: white)');
  });

  it('draws one circle for every bubble the scanner will sample', () => {
    const layout = makeLayout();
    const source = renderSheetTypst(layout, makeOptions());
    const expected = bubbleGroups(layout).reduce((sum, group) => sum + group.bubbles.length, 0);
    expect(countOf(source, /circle\(/g)).toBe(expected);
  });

  it('places every bubble at the centre the layout gave it', () => {
    const layout = makeLayout();
    const source = renderSheetTypst(layout, makeOptions());
    const first = layout.questionColumns[0]?.rows[0]?.bubbles[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    // Typst positions by the top left corner, so a centre becomes centre minus radius.
    const left = Math.round((first.cxMm - first.rMm) * 1000) / 1000;
    const top = Math.round((first.cyMm - first.rMm) * 1000) / 1000;
    expect(source).toContain(`place(dx: ${String(left)}mm, dy: ${String(top)}mm, circle(`);
  });

  it('draws the four corner fiducials the scanner locks onto', () => {
    const layout = makeLayout();
    const source = renderSheetTypst(layout, makeOptions());
    for (const fiducial of layout.fiducials) {
      expect(source).toContain(
        `place(dx: ${String(fiducial.xMm)}mm, dy: ${String(fiducial.yMm)}mm, rect(`,
      );
    }
  });

  it('draws one timing mark per question row', () => {
    const layout = makeLayout({ questions: choiceQuestions(40), columns: 2 });
    const source = renderSheetTypst(layout, makeOptions());
    // Twenty timing marks plus four fiducials are the only filled rectangles
    // besides the QR modules, which the next test counts on its own.
    expect(layout.timingMarks).toHaveLength(20);
    for (const mark of layout.timingMarks) {
      expect(source).toContain(`dy: ${String(Math.round(mark.yMm * 1000) / 1000)}mm`);
    }
  });

  it('draws one square per dark code module and leaves a quiet zone', () => {
    const layout = makeLayout();
    const dark = layout.code.modules.flat().filter(Boolean).length;
    const source = renderSheetTypst(layout, makeOptions());
    const fills = countOf(source, /rect\(width: [\d.]+mm, height: [\d.]+mm, fill: rgb/g);
    // Fiducials and timing marks are filled too, so the modules are the rest.
    expect(fills).toBe(dark + layout.fiducials.length + layout.timingMarks.length);

    const quiet = GEOMETRY.codeQuietModules;
    const moduleMm = layout.code.box.wMm / (layout.code.modules.length + 2 * quiet);
    expect(source).toContain(
      `dx: ${String(Math.round((layout.code.box.xMm + moduleMm * quiet) * 1000) / 1000)}mm`,
    );
  });

  it('draws the modules in the orientation the matrix has them', () => {
    // A count of dark modules passes just as happily when x and y are swapped,
    // and a transposed code is unreadable while looking entirely plausible. So
    // the emitted rectangles are read back into a grid and compared cell by
    // cell against the matrix they came from.
    const layout = makeLayout();
    const { modules, box } = layout.code;
    const quiet = GEOMETRY.codeQuietModules;
    const moduleMm = box.wMm / (modules.length + 2 * quiet);
    const originXMm = box.xMm + moduleMm * quiet;
    const originYMm = box.yMm + moduleMm * quiet;
    const source = renderSheetTypst(layout, makeOptions());

    const drawn = modules.map((row) => row.map(() => false));
    const place = /place\(dx: ([\d.]+)mm, dy: ([\d.]+)mm, rect\(width: ([\d.]+)mm/g;
    for (const match of source.matchAll(place)) {
      const [, dx, dy, width] = match;
      if (dx === undefined || dy === undefined || width === undefined) continue;
      // Fiducials and timing marks are filled rectangles too, so the code's own
      // modules are picked out by their width.
      if (Math.abs(Number(width) - (moduleMm + 0.01)) > 0.005) continue;
      const x = Math.round((Number(dx) - originXMm) / moduleMm);
      const y = Math.round((Number(dy) - originYMm) / moduleMm);
      const row = drawn[y];
      if (row === undefined || x < 0 || x >= row.length) throw new Error('module off the grid');
      row[x] = true;
    }
    expect(drawn).toEqual(modules);
  });

  it('draws the code the layout produced, so the two can never disagree', () => {
    // The renderer takes no code of its own, so a sheet and the code printed on
    // it come from one call and cannot describe different geometry.
    const layout = makeLayout();
    const decoded = decodeSheetCode(layout.code.payload);
    expect(decoded?.mode).toBe('full');
    expect(decoded?.templateId).toBe('3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90');
  });

  it('prints the answer letters inside the bubbles', () => {
    const source = renderSheetTypst(makeLayout(), makeOptions());
    for (const symbol of ['A', 'B', 'C', 'D', 'E']) {
      expect(source).toContain(`"${symbol}"`);
    }
  });

  it('prints Arabic answer letters when the teacher asks for them', () => {
    const source = renderSheetTypst(
      makeLayout({ questions: choiceQuestions(40, arabicSymbols(4)) }),
      makeOptions(),
    );
    for (const symbol of ['أ', 'ب', 'ج', 'د']) {
      expect(source).toContain(`"${symbol}"`);
    }
  });

  it('prints a letter once: inside its bubble, beside it, or above the column', () => {
    // A letter inside a bubble is boxed to the bubble's own size, and one that
    // is not inside is boxed to the label slot, so the two are countable apart.
    const sideMm = (layout: SheetLayout): string =>
      String((layout.questionColumns[0]?.rows[0]?.bubbles[0]?.rMm ?? 0) * 2);
    const inside = (source: string, layout: SheetLayout): number =>
      countOf(
        source,
        new RegExp(`box\\(width: ${sideMm(layout)}mm, height: ${sideMm(layout)}mm`, 'g'),
      );
    const outside = (source: string): number =>
      countOf(source, /box\(width: 3\.2mm, align\(center/g);

    const internal = makeLayout();
    const external = makeLayout({ questions: choiceQuestions(40, latinSymbols(5), 'external') });
    const header = makeLayout({ questions: choiceQuestions(40, latinSymbols(5), 'header') });
    const internalSource = renderSheetTypst(internal, makeOptions());
    const externalSource = renderSheetTypst(external, makeOptions());
    const headerSource = renderSheetTypst(header, makeOptions());

    expect(inside(internalSource, internal)).toBe(
      questionBubbles(internal) + gridBubbles(internal),
    );
    expect(outside(internalSource)).toBe(0);

    // Only the id grid keeps its digits inside the bubbles in the other two.
    expect(inside(externalSource, external)).toBe(gridBubbles(external));
    expect(outside(externalSource)).toBe(questionBubbles(external));

    // A header prints its letters once per block, not once per bubble, which is
    // the whole reason it exists.
    const blocks = header.questionColumns.reduce((n, c) => n + c.headers.length, 0);
    expect(inside(headerSource, header)).toBe(gridBubbles(header));
    expect(outside(headerSource)).toBe(blocks * 5);
  });

  it('prints an external letter to the left of the bubble it belongs to', () => {
    const layout = makeLayout({ questions: choiceQuestions(40, latinSymbols(5), 'external') });
    const source = renderSheetTypst(layout, makeOptions());
    const label = layout.questionColumns[0]?.rows[0]?.choiceLabels[0];
    expect(label).toBeDefined();
    if (label === undefined) return;
    // Centre alignment subtracts half the box width from the anchor.
    const left = Math.round((label.anchor.xMm - 3.2 / 2) * 1000) / 1000;
    expect(source).toContain(`place(dx: ${String(left)}mm,`);
  });

  it('rotates the branding and the template name into their edge bands', () => {
    const source = renderSheetTypst(makeLayout(), makeOptions());
    expect(source).toContain('rotate(-90deg, origin: center');
    expect(source).toContain('rotate(90deg, origin: center');
    expect(source).toContain('"TRANSFERCHECKER.COM"');
    expect(source).toContain('"Standard 40"');
  });

  it('right aligns question numbers so the column reads as one edge', () => {
    const source = renderSheetTypst(makeLayout(), makeOptions());
    expect(source).toContain('align(right, text(');
    expect(source).toContain('"40"');
  });

  it('quotes a hostile template name instead of letting it become code', () => {
    const source = renderSheetTypst(makeLayout({ name: '#import "evil.typ": *' }), makeOptions());
    expect(source).toContain('"#import \\"evil.typ\\": *"');
    expect(source).not.toContain('\n#import');
  });

  it('produces identical source for identical input', () => {
    const layout = makeLayout();
    const options = makeOptions();
    expect(renderSheetTypst(layout, options)).toBe(renderSheetTypst(layout, options));
  });
});
