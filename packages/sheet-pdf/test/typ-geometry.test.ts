// Tier 1 of the golden set: the anti circularity check.
//
// Every other test in this repository compares the engine against a renderer
// that reads the same `layoutSheet` the engine reads. This one reads the
// PRINTED artifact back: the Typst source, parsed as text, element by element,
// against the layout object it claims to draw.
//
// It is the only check available today that runs through a second code path,
// and it is why the samples in `docs/samples` are committed rather than
// generated and thrown away.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import type { SheetLayout, StockTemplate } from '@transferchecker/sheet-spec';
import { renderSheetTypst } from '../src/index';
import { geometryDiff, parseTypSheet } from '../tools/typ-geometry';

const TEXT = {
  name: 'Standard',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

const OPTIONS = { fonts: ['IBM Plex Sans'], warningLines: ['Print at 100 percent'] };

/**
 * A hundredth of a millimetre.
 *
 * Not a tolerance for real error, since both sides are arithmetic on the same
 * numbers and the measured difference is 0.0000 mm on every element of every
 * stock template. It is the rounding the emitter applies on its way to text,
 * and anything above it is a bug rather than a rounding.
 */
const TOLERANCE_MM = 0.01;

function layoutOf(kind: StockTemplate): SheetLayout {
  const result = layoutSheet(stockTemplate(kind, TEXT));
  if (result.kind !== 'ok') throw new Error(`${kind} did not lay out`);
  return result.layout;
}

const KINDS: readonly StockTemplate[] = ['quick20', 'standard50', 'full100'];

describe('the printed source carries the geometry the layout says it does', () => {
  it('places every element of every stock template where the layout put it', () => {
    for (const kind of KINDS) {
      const layout = layoutOf(kind);
      const typ = parseTypSheet(renderSheetTypst(layout, OPTIONS));

      for (const row of geometryDiff(layout, typ)) {
        const label = `${kind} ${row.element}`;
        expect(`${label}: ${String(row.found)}`).toBe(`${label}: ${String(row.expected)}`);
        expect(`${label}: ${row.worstMm.toFixed(4)}`).toBe(`${label}: 0.0000`);
        expect(row.worstMm).toBeLessThan(TOLERANCE_MM);
      }
    }
  });

  it('reads the same geometry off a sheet laid two to a page', () => {
    // The body is emitted once and placed twice, so a carrier must parse to one
    // sheet's geometry. If it did not, every number in this file would be
    // measuring the tiling rather than the sheet.
    const layout = layoutOf('quick20');
    const page = {
      carrier: { widthMm: 297, heightMm: 210 },
      origins: [
        { xMm: 0, yMm: 0 },
        { xMm: 149, yMm: 0 },
      ],
      cuts: [],
    };
    const typ = parseTypSheet(renderSheetTypst(layout, { ...OPTIONS, page }));

    for (const row of geometryDiff(layout, typ)) {
      const label = `2 up ${row.element}`;
      expect(`${label}: ${String(row.found)}`).toBe(`${label}: ${String(row.expected)}`);
      expect(row.worstMm).toBeLessThan(TOLERANCE_MM);
    }
  });

  it('keeps the committed samples honest about the geometry they claim', () => {
    // `docs/samples` is what a person opens to see what the sheet looks like,
    // and a stale sample is a document that lies. Regenerating them is one
    // command, `pnpm --filter @transferchecker/sheet-pdf sample`, and this test
    // is what says when it is due.
    const here = fileURLToPath(new URL('.', import.meta.url));
    for (const [file, kind] of [
      ['stock-20', 'quick20'],
      ['stock-50', 'standard50'],
      ['stock-100', 'full100'],
    ] as const) {
      const source = readFileSync(`${here}../../../docs/samples/${file}.typ`, 'utf8');
      const layout = layoutOf(kind);

      for (const row of geometryDiff(layout, parseTypSheet(source))) {
        const label = `${file} ${row.element}`;
        expect(`${label}: ${String(row.found)}`).toBe(`${label}: ${String(row.expected)}`);
        expect(row.worstMm).toBeLessThan(TOLERANCE_MM);
      }
    }
  });

  it('fails when the emitter moves an element, which is the point of it', () => {
    // A guard on the guard: a diff that cannot go red proves nothing. One
    // timing mark is moved half a millimetre in the layout the comparison is
    // made against, and the check must see it.
    const layout = layoutOf('quick20');
    const typ = parseTypSheet(renderSheetTypst(layout, OPTIONS));
    const moved: SheetLayout = {
      ...layout,
      timingMarks: layout.timingMarks.map((rect, index) =>
        index === 3 ? { ...rect, yMm: rect.yMm + 0.5 } : rect,
      ),
    };

    const row = geometryDiff(moved, typ).find((entry) => entry.element === 'timing marks');
    expect(row?.worstMm).toBeGreaterThan(TOLERANCE_MM);
  });
});
