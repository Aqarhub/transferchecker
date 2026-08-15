// The registration probe, and the reason it is not a gate.
//
// The settle pass of the judgement workshop proposed the escape ring's
// asymmetry as the sheet's only per bubble registration probe in x, to close
// the one hole nothing else can see: every timing mark sits at a single x, a
// millimetre from two corners the homography already pins exactly, so a curl
// about a vertical axis reports a residual near zero while the middle of the
// page walks off its bubbles.
//
// The mechanism is real. The proposed USE of it is not, and this test is why.
// Measured on a rendered sheet with a known sideways error injected into the
// frame, the median asymmetry over 250 bubbles is:
//
//     shift mm    median asymX
//       0.00        0.0000
//       0.10        0.0000     dead below about 0.2 mm
//       0.30       -0.0129
//       0.50       -0.0852
//       0.80       -0.1155     peak
//       1.20       -0.0009     back to zero
//
// It is a BAND PASS detector, not a monotonic one, and the reason is geometric:
// once the error exceeds the ring's width the ring has left the printed outline
// on both sides and reads clean paper on each, which is the same reading a
// perfectly registered bubble gives.
//
// So gating on it, which the settled document proposes as
// `not_flat { axis: 'x' }`, would pass exactly the failure it was introduced to
// catch: a full bubble pitch is 5.6 mm, twenty times past the point where the
// signal has already collapsed to nothing. A gate that reads clean at the
// dangerous displacement is worse than no gate, because it converts an unknown
// into a false assurance, and this product's rule is that a confident wrong
// diagnosis is worse than none.
//
// What it is kept for is the band it actually covers, 0.3 to 0.8 mm, which is
// where the margin lives: at a disc radius of 1.5 mm a straight mark edge moves
// the fill ratio by about 0.38 ink per millimetre, so half a millimetre of
// error is 0.19 ink against an uncertain margin of 0.08. In that band the probe
// says "flag more bubbles", which is a safe direction.
//
// The real fix stays printed and is in docs/CORE-OMR.md section 7ب: a second
// landmark column, mirrored into the right margin or into the column gap.

import { describe, expect, it } from 'vitest';
import { layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import { findFiducials } from '../src/geometry/fiducials';
import { readSheetCode } from '../src/code/index';
import { paperFrame } from '../src/geometry/frame';
import { readTimingMarks } from '../src/measure/timing';
import { photometryOf } from '../src/measure/photometry';
import { measureBubble } from '../src/measure/bubble';
import { ringFor } from '../src/measure/ring';
import { perturbFrame } from '../src/scan/perturb';
import { renderSheet } from '../tools/render';

const TEXT = {
  name: 'Standard 50',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

describe('the ring asymmetry probe', () => {
  it('sees a sideways error in a band, and goes blind past it', () => {
    const spec = stockTemplate('standard50', TEXT);
    const planned = layoutSheet(spec);
    expect(planned.kind).toBe('ok');
    if (planned.kind !== 'ok') return;
    const layout = planned.layout;

    const pxPerMm = 10;
    const image = renderSheet(layout, { pxPerMm });
    const found = findFiducials(image);
    expect(found.kind).toBe('ok');
    if (found.kind !== 'ok') return;
    const code = readSheetCode(image, found.quad);
    expect(code.kind).toBe('ok');
    if (code.kind !== 'ok') return;
    const frame = paperFrame(code.corners, layout);
    expect(frame).not.toBeNull();
    if (frame === null) return;
    const timing = readTimingMarks(image, frame, layout);
    expect(timing.kind).toBe('ok');
    if (timing.kind !== 'ok') return;
    const field = photometryOf(image, frame, layout, timing.marks);
    expect(field).not.toBeNull();
    if (field === null) return;

    const ring = ringFor(
      spec.bubble.radiusMm,
      Math.min(spec.bubble.pitchXMm, spec.bubble.pitchYMm, spec.bubble.gridPitchYMm),
    );
    expect(ring.usable).toBe(true);

    const bubbles = layout.questionColumns.flatMap((column) =>
      column.rows.flatMap((row) => row.bubbles),
    );

    const at = (shiftMm: number): number => {
      const shifted = perturbFrame(frame, {
        angleDeg: 0,
        scale: 1,
        dx: shiftMm * pxPerMm,
        dy: 0,
      });
      const values = bubbles
        .map((bubble) => measureBubble(image, shifted, field, bubble, 0, 'none', ring))
        .filter((reading) => reading.asymXMeasured)
        .map((reading) => Math.abs(reading.asymX));
      return median(values);
    };

    const aligned = at(0);
    const inBand = at(0.5);
    const pastBand = at(1.2);

    // Aligned reads nothing, which is what makes the middle of the band mean
    // something at all.
    expect(aligned).toBeLessThan(0.005);
    // Half a millimetre is seen clearly.
    expect(inBand).toBeGreaterThan(0.03);
    // And this is the finding: past the ring's own width the probe is blind
    // again, and reads the same as a perfectly registered sheet.
    expect(pastBand).toBeLessThan(inBand / 4);
  });
});
