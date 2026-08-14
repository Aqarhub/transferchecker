import { describe, expect, it } from 'vitest';
import { bubbleGroups } from '@transferchecker/sheet-spec';
import { renderSheetTypst } from '../src/index';
import { makeLayout, makeOptions, makeQr } from './helpers';

const countOf = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0;

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
    expect(source).toContain(`#place(dx: ${String(left)}mm, dy: ${String(top)}mm, circle(`);
  });

  it('draws the four corner fiducials the scanner locks onto', () => {
    const layout = makeLayout();
    const source = renderSheetTypst(layout, makeOptions());
    for (const fiducial of layout.fiducials) {
      expect(source).toContain(
        `#place(dx: ${String(fiducial.xMm)}mm, dy: ${String(fiducial.yMm)}mm, rect(`,
      );
    }
  });

  it('draws one timing mark per question row', () => {
    const layout = makeLayout({ questions: 40, columns: 2 });
    const source = renderSheetTypst(layout, makeOptions());
    // Twenty timing marks plus four fiducials are the only filled rectangles
    // besides the QR modules, which the next test counts on its own.
    expect(layout.timingMarks).toHaveLength(20);
    for (const mark of layout.timingMarks) {
      expect(source).toContain(`dy: ${String(Math.round(mark.yMm * 1000) / 1000)}mm`);
    }
  });

  it('draws one square per dark QR module and leaves a quiet zone', () => {
    const qr = makeQr(21);
    const dark = qr.flat().filter(Boolean).length;
    const layout = makeLayout();
    const source = renderSheetTypst(layout, makeOptions({ qr }));
    const fills = countOf(source, /rect\(width: [\d.]+mm, height: [\d.]+mm, fill: rgb/g);
    // Fiducials and timing marks are filled too, so the QR modules are the rest.
    expect(fills).toBe(dark + layout.fiducials.length + layout.timingMarks.length);
    // Twenty one modules plus a four module quiet zone on each side.
    const moduleMm = layout.qr.wMm / 29;
    expect(source).toContain(
      `dx: ${String(Math.round((layout.qr.xMm + moduleMm * 4) * 1000) / 1000)}mm`,
    );
  });

  it('prints the answer letters inside the bubbles', () => {
    const source = renderSheetTypst(makeLayout({ choices: 5 }), makeOptions());
    for (const symbol of ['A', 'B', 'C', 'D', 'E']) {
      expect(source).toContain(`"${symbol}"`);
    }
  });

  it('prints Arabic answer letters when the teacher asks for them', () => {
    const source = renderSheetTypst(
      makeLayout({ choices: 4, choiceLabels: 'arabic' }),
      makeOptions(),
    );
    for (const symbol of ['أ', 'ب', 'ج', 'د']) {
      expect(source).toContain(`"${symbol}"`);
    }
  });

  it('rotates the branding and the title into their edge bands', () => {
    const source = renderSheetTypst(makeLayout(), makeOptions());
    expect(source).toContain('rotate(-90deg, origin: center');
    expect(source).toContain('rotate(90deg, origin: center');
    expect(source).toContain('"TRANSFERCHECKER.COM"');
  });

  it('right aligns question numbers so the column reads as one edge', () => {
    const source = renderSheetTypst(makeLayout(), makeOptions());
    expect(source).toContain('align(right, text(');
    expect(source).toContain('"40"');
  });

  it('quotes a hostile exam title instead of letting it become code', () => {
    const source = renderSheetTypst(makeLayout({ title: '#import "evil.typ": *' }), makeOptions());
    expect(source).toContain('"#import \\"evil.typ\\": *"');
    expect(source).not.toContain('\n#import');
  });

  it('produces identical source for identical input', () => {
    const layout = makeLayout();
    const options = makeOptions();
    expect(renderSheetTypst(layout, options)).toBe(renderSheetTypst(layout, options));
  });
});
