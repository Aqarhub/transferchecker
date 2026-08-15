// Where the escape ring may sit, across everything the schema permits.
//
// This is the test whose absence let a real defect through. The ring was a fixed
// 1.1 to 1.4 radii, which reads as obviously safe and is not: at the schema's
// smallest bubble it starts exactly on the bubble's own printed outline, and at
// the largest it ends inside the neighbour's. Both are legal specs, and on
// either one every bubble on the sheet would have reported ink that escaped.

import { describe, expect, it } from 'vitest';
import { BubbleMetricsSchema, DEFAULT_BUBBLE } from '@transferchecker/sheet-spec';
import { MAX_STROKE_MM, ringFor } from '../src/measure/ring';

/** Bubble metrics at the corners of what the schema accepts, and in the middle. */
const CASES = [
  { name: 'default', radiusMm: 2, pitchXMm: 5.6, pitchYMm: 7, gridPitchYMm: 6 },
  {
    name: 'dense hundred question sheet',
    radiusMm: 2,
    pitchXMm: 5.6,
    pitchYMm: 6,
    gridPitchYMm: 5.4,
  },
  {
    name: 'smallest bubble at its tightest legal pitch',
    radiusMm: 1.6,
    pitchXMm: 5,
    pitchYMm: 6,
    gridPitchYMm: 5,
  },
  {
    name: 'largest bubble at its tightest legal pitch',
    radiusMm: 3.5,
    pitchXMm: 8,
    pitchYMm: 8,
    gridPitchYMm: 8,
  },
  { name: 'largest bubble with room', radiusMm: 3.5, pitchXMm: 12, pitchYMm: 14, gridPitchYMm: 14 },
];

describe('the escape ring holds paper and nothing else', () => {
  it('clears the bubble outline and the neighbour on every legal geometry', () => {
    for (const metrics of CASES) {
      const { name, radiusMm, ...rest } = metrics;
      // Every case must be a spec the schema would really accept, or the test
      // is defending against geometry that cannot exist.
      const parsed = BubbleMetricsSchema.safeParse({ radiusMm, ...rest });
      expect(`${name}: ${parsed.success ? 'legal' : 'rejected'}`).toBe(`${name}: legal`);
      if (!parsed.success) continue;

      const minPitchMm = Math.min(rest.pitchXMm, rest.pitchYMm, rest.gridPitchYMm);
      const ring = ringFor(radiusMm, minPitchMm);
      if (!ring.usable) continue;

      const innerMm = ring.inner * radiusMm;
      const outerMm = ring.outer * radiusMm;
      // The bubble's own printed outline, at the darkest theme.
      const outlineOuterMm = radiusMm + MAX_STROKE_MM / 2;
      // Where the nearest neighbour's printed outline begins.
      const neighbourInkMm = minPitchMm - radiusMm - MAX_STROKE_MM / 2;

      expect(`${name}: inner ${innerMm.toFixed(2)} vs outline ${outlineOuterMm.toFixed(2)}`).toBe(
        `${name}: inner ${innerMm.toFixed(2)} vs outline ${outlineOuterMm.toFixed(2)}`,
      );
      expect(innerMm).toBeGreaterThan(outlineOuterMm);
      expect(outerMm).toBeLessThan(neighbourInkMm);
      expect(outerMm - innerMm).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('switches the channel off rather than measuring printed ink', () => {
    // A bubble so large for its pitch that no ring fits between its own outline
    // and its neighbour's. The honest answer is that there is no escape channel
    // on this sheet, not a number that means the furniture.
    const ring = ringFor(3.5, 8);
    expect(ring.usable).toBe(false);
  });

  it('keeps a usable ring on the geometry the stock sheets actually print', () => {
    const ring = ringFor(
      DEFAULT_BUBBLE.radiusMm,
      Math.min(DEFAULT_BUBBLE.pitchXMm, DEFAULT_BUBBLE.pitchYMm, DEFAULT_BUBBLE.gridPitchYMm),
    );
    expect(ring.usable).toBe(true);
    expect(ring.inner * DEFAULT_BUBBLE.radiusMm).toBeGreaterThan(
      DEFAULT_BUBBLE.radiusMm + MAX_STROKE_MM / 2,
    );
  });
});
