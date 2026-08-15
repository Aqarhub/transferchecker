// Finding the sheet in a frame, and reading what it says about itself.
//
// Every image here is generated from the same layout object the PDF generator
// draws from, so a failure means the scanner and the sheet disagree about
// millimetres rather than that a fixture went stale.

import { describe, expect, it } from 'vitest';
import { layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import type { SheetLayout, SheetSpec } from '@transferchecker/sheet-spec';
import { findFiducials } from '../src/geometry/fiducials';
import { MIN_MODULE_PX, readSheetCode } from '../src/code/index';
import {
  FIDUCIAL_INSET_BOTTOM_MM,
  FIDUCIAL_INSET_TOP_MM,
  FIDUCIAL_INSET_X_MM,
  estimateFrame,
  paperFrame,
  toImage,
} from '../src/geometry/frame';
import { renderSheet } from '../tools/render';
import { photograph } from '../tools/photograph';

const TEXT = {
  name: 'Standard 50',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

function sheet(kind: 'quick20' | 'standard50' | 'full100'): {
  spec: SheetSpec;
  layout: SheetLayout;
} {
  const spec = stockTemplate(kind, TEXT);
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') throw new Error(`layout failed for ${kind}`);
  return { spec, layout: result.layout };
}

describe('the four corner squares are found', () => {
  it('finds them on a flat render, to a fraction of a millimetre', () => {
    const { layout } = sheet('standard50');
    const pxPerMm = 6;
    const image = renderSheet(layout, { pxPerMm });

    const found = findFiducials(image);
    expect(found.kind).toBe('ok');
    if (found.kind !== 'ok') return;

    const expected = layout.fiducials.map((rect) => ({
      x: (rect.xMm + rect.wMm / 2) * pxPerMm,
      y: (rect.yMm + rect.hMm / 2) * pxPerMm,
    }));
    // The search returns them in no particular order, so each printed centre
    // must have a found centre within a third of a millimetre of it.
    for (const target of expected) {
      const nearest = Math.min(
        ...found.quad.points.map((point) => Math.hypot(point.x - target.x, point.y - target.y)),
      );
      expect(nearest).toBeLessThan(pxPerMm / 3);
    }

    // Eight millimetres of printed square, measured back out of the pixels.
    for (const side of found.quad.sidesPx) {
      expect(side / pxPerMm).toBeGreaterThan(7.5);
      expect(side / pxPerMm).toBeLessThan(8.5);
    }
  });

  it('finds them in a tilted, shadowed, noisy photograph', () => {
    const { layout } = sheet('quick20');
    const flat = renderSheet(layout, { pxPerMm: 10 });
    const frame = photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
      width: 1080,
      height: 1440,
      yawDeg: 6,
      pitchDeg: -4,
      rollDeg: 2,
      shadow: { fromMm: 0, toMm: layout.paper.heightMm, strength: 0.35 },
      noise: 4,
      blur: 1,
      seed: 7,
    });

    const found = findFiducials(frame);
    expect(found.kind).toBe('ok');
  });
});

describe('the sheet says what it is', () => {
  it('reads the printed code off a flat render and rebuilds the spec', () => {
    for (const kind of ['quick20', 'standard50', 'full100'] as const) {
      const { spec, layout } = sheet(kind);
      const image = renderSheet(layout, { pxPerMm: 8 });

      const found = findFiducials(image);
      expect(found.kind).toBe('ok');
      if (found.kind !== 'ok') continue;

      const code = readSheetCode(image, found.quad);
      expect(`${kind}: ${code.kind}`).toBe(`${kind}: ok`);
      if (code.kind !== 'ok') continue;
      expect(code.decoded.mode).toBe('full');
      if (code.decoded.mode !== 'full') continue;

      expect(code.decoded.templateId).toBe(spec.templateId);
      expect(code.decoded.spec.paper).toBe(spec.paper);
      expect(code.decoded.spec.questions).toHaveLength(spec.questions.length);
      expect(code.decoded.spec.bubble).toEqual(spec.bubble);
    }
  });

  it('reads it through perspective, shadow and blur', () => {
    const { spec, layout } = sheet('standard50');
    const flat = renderSheet(layout, { pxPerMm: 12 });
    const frame = photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
      width: 1920,
      height: 2560,
      yawDeg: 5,
      pitchDeg: 4,
      rollDeg: -3,
      shadow: { fromMm: 0, toMm: layout.paper.heightMm, strength: 0.3 },
      noise: 3,
      blur: 1,
      seed: 11,
    });

    const found = findFiducials(frame);
    expect(found.kind).toBe('ok');
    if (found.kind !== 'ok') return;

    const code = readSheetCode(frame, found.quad);
    expect(code.kind).toBe('ok');
    if (code.kind !== 'ok') return;
    expect(code.decoded.templateId).toBe(spec.templateId);
    expect(code.modulePx).toBeGreaterThan(3);
  });

  it('reads below the nominal resolution floor, so the floor is a diagnosis', () => {
    // Defense د11 asks for three pixels per code module. Defense د6 grew the
    // module from 0.5 mm to 0.81 mm, so the frame that lands under the floor is
    // now a much smaller one: at 720 by 1280 with 86 percent fill the module
    // spans 2.39 pixels [measured].
    //
    // It reads anyway, with tilt, shadow, noise and blur on top, and that is
    // measured here rather than hoped for. The reason it reads is the two
    // architectural decisions in this package: nothing is resampled, so no
    // detail is thrown away before the modules are measured, and the finder
    // patterns are found from the sheet's own printed geometry instead of by a
    // run length sweep that needs one module runs to survive thresholding.
    //
    // So the floor is a DIAGNOSIS and not a veto. A read that succeeds under it
    // is kept, and a read that fails under it is named "come closer" instead of
    // being an unexplained refusal. That narrows what د11 records: 1260 pixels
    // across the page is where a decode stops being comfortable, not where it
    // stops being possible.
    const { spec, layout } = sheet('standard50');
    const flat = renderSheet(layout, { pxPerMm: 12 });
    const frame = photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
      width: 720,
      height: 1280,
      fill: 0.86,
      yawDeg: 5,
      pitchDeg: 4,
      rollDeg: -3,
      shadow: { fromMm: 0, toMm: layout.paper.heightMm, strength: 0.3 },
      noise: 3,
      blur: 1,
      seed: 11,
    });

    const found = findFiducials(frame);
    expect(found.kind).toBe('ok');
    if (found.kind !== 'ok') return;

    const code = readSheetCode(frame, found.quad);
    expect(code.kind).toBe('ok');
    if (code.kind !== 'ok') return;
    expect(code.modulePx).toBeLessThan(MIN_MODULE_PX);
    expect(code.decoded.templateId).toBe(spec.templateId);
  });

  it('reads it with the paper held upside down', () => {
    const { spec, layout } = sheet('quick20');
    const flat = renderSheet(layout, { pxPerMm: 12 });
    for (const quarterTurns of [1, 2, 3]) {
      const frame = photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
        width: 1440,
        height: 2560,
        quarterTurns,
        seed: 3,
      });
      const found = findFiducials(frame);
      expect(found.kind).toBe('ok');
      if (found.kind !== 'ok') continue;

      const code = readSheetCode(frame, found.quad);
      expect(`turns ${String(quarterTurns)}: ${code.kind}`).toBe(
        `turns ${String(quarterTurns)}: ok`,
      );
      if (code.kind !== 'ok') continue;
      expect(code.decoded.templateId).toBe(spec.templateId);
    }
  });

  it('refuses a frame that cannot carry the code, and says so', () => {
    const { layout } = sheet('full100');
    const flat = renderSheet(layout, { pxPerMm: 12 });
    // A sheet photographed small enough that even the grown module lands well
    // under three pixels, with the noise and blur a phone actually delivers.
    // This is the proven defect: the answer is a named refusal, not a silent
    // failure and never a guess.
    //
    // The noise and the blur are load bearing here rather than decoration. On a
    // clean synthetic frame this same code reads at 1.11 pixels per module
    // [measured], because an area averaged render of a flat page carries no
    // grain and the decoder resamples nothing. A photograph does carry grain,
    // and it stops reading at about 2 pixels per module.
    const frame = photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
      width: 480,
      height: 854,
      fill: 0.8,
      noise: 3,
      blur: 1,
      seed: 5,
    });

    const found = findFiducials(frame);
    if (found.kind !== 'ok') return;
    const code = readSheetCode(frame, found.quad);
    expect(code.kind).toBe('too_small');
    if (code.kind !== 'too_small') return;
    expect(code.modulePx).toBeLessThan(3);
  });
});

describe('the paper frame puts every printed feature where it was printed', () => {
  it('predicts the timing marks it was never given', () => {
    const { layout } = sheet('standard50');
    const pxPerMm = 8;
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

    // The frame was solved from the four corner squares alone. If the model is
    // right, it predicts the middle of the page, which is where every bubble
    // lives and where a wrong model does its damage.
    for (const mark of layout.timingMarks) {
      const centre = toImage(frame, mark.xMm + mark.wMm / 2, mark.yMm + mark.hMm / 2);
      const expectedX = (mark.xMm + mark.wMm / 2) * pxPerMm;
      const expectedY = (mark.yMm + mark.hMm / 2) * pxPerMm;
      expect(Math.hypot(centre.x - expectedX, centre.y - expectedY)).toBeLessThan(pxPerMm / 2);
    }
  });

  it('estimates the paper size from the corner squares alone', () => {
    const { layout } = sheet('standard50');
    const image = renderSheet(layout, { pxPerMm: 8 });
    const found = findFiducials(image);
    if (found.kind !== 'ok') return;
    const code = readSheetCode(image, found.quad);
    if (code.kind !== 'ok') return;

    const estimate = estimateFrame(code.corners, found.quad.sidesPx);
    expect(estimate).not.toBeNull();
    if (estimate === null) return;

    // Within a few percent, which is all the code window needs and all the
    // fiducial side can honestly deliver. The two spans are not the same inset
    // on both ends any more: defense د1 pushed the bottom pair further in than
    // the top pair, so the rectangle the squares form is not centred.
    const expectedX = layout.paper.widthMm - 2 * FIDUCIAL_INSET_X_MM;
    const expectedY = layout.paper.heightMm - FIDUCIAL_INSET_TOP_MM - FIDUCIAL_INSET_BOTTOM_MM;
    expect(Math.abs(estimate.spanXMm - expectedX) / expectedX).toBeLessThan(0.04);
    expect(Math.abs(estimate.spanYMm - expectedY) / expectedY).toBeLessThan(0.04);
  });
});
