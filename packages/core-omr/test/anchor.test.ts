// The horizontal anchor, measured against the failure it exists for.
//
// Everything here is run on a sheet with a curl injected into it: a cylinder
// about a vertical axis, flat at the two columns the corner squares are printed
// in and bulging in between. That deformation is the one the rest of the engine
// is blind to by construction, so a claim about it can only be made by
// producing it.
//
// The numbers in the comments are measured by this file on this repository, not
// quoted from anywhere.

import { describe, expect, it } from 'vitest';
import { GEOMETRY, layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import type { SheetLayout, SheetSpec } from '@transferchecker/sheet-spec';
import { readSheetCode } from '../src/code/index';
import { findFiducials } from '../src/geometry/fiducials';
import { paperFrame } from '../src/geometry/frame';
import { MAX_X_RESIDUAL_MM, readAnchors } from '../src/measure/anchor';
import { readTimingMarks } from '../src/measure/timing';
import { scanSheet } from '../src/scan/pipeline';
import { bendSheet } from '../tools/bend';
import { renderSheet } from '../tools/render';
import type { GrayImage } from '../src/image/gray';

const TEXT = {
  name: 'Standard 50',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

const PX_PER_MM = 10;

function sheet(): { spec: SheetSpec; layout: SheetLayout; flat: GrayImage } {
  const spec = stockTemplate('standard50', TEXT);
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') throw new Error('the stock sheet did not lay out');
  return { spec, layout: result.layout, flat: renderSheet(result.layout, { pxPerMm: PX_PER_MM }) };
}

/** The same sheet with a curl of `bulgeMm` at the middle of the page. */
function bent(layout: SheetLayout, flat: GrayImage, bulgeMm: number): GrayImage {
  const firstRow = layout.questionColumns[0]?.rows[0]?.numberAnchor.yMm ?? 60;
  return bendSheet(flat, {
    pxPerMm: PX_PER_MM,
    bulgeMm,
    leftMm: GEOMETRY.marginSideMm + GEOMETRY.fiducialMm / 2,
    rightMm: layout.paper.widthMm - GEOMETRY.marginSideMm - GEOMETRY.fiducialMm / 2,
    fromYMm: firstRow - 12,
  });
}

/** Reads the two registration probes off one image, through the real pipeline stages. */
function probes(
  image: GrayImage,
  layout: SheetLayout,
): { timingMm: number; anchors: ReturnType<typeof readAnchors> } {
  const found = findFiducials(image);
  if (found.kind !== 'ok') throw new Error('the corner squares moved, which is not this test');
  const code = readSheetCode(image, found.quad);
  if (code.kind !== 'ok') throw new Error('the code moved, which is not this test');
  const frame = paperFrame(code.corners, layout);
  if (frame === null) throw new Error('no frame');

  const timing = readTimingMarks(image, frame, layout);
  if (timing.kind !== 'ok') throw new Error(`timing said ${timing.kind}`);
  return { timingMm: timing.residualMm, anchors: readAnchors(image, frame, layout) };
}

describe('the anchor measures what the corners and the timing marks cannot', () => {
  it('reads clean on a flat sheet', () => {
    const { layout, flat } = sheet();
    const read = probes(flat, layout);
    expect(read.anchors.kind).toBe('ok');
    if (read.anchors.kind !== 'ok') return;
    expect(read.anchors.residualMm).toBeLessThan(0.05);
    for (const column of read.anchors.columns) {
      expect(Math.abs(column.offsetMm)).toBeLessThan(0.05);
    }
  });

  it('names the blind spot by measuring it: the timing residual stays at zero', () => {
    // This is the whole reason the marks are printed. At a 3 mm bulge the middle
    // of the page has moved 2 mm sideways, which is a third of a bubble pitch,
    // and the sheet's other two pieces of evidence report a perfect sheet:
    //
    //   bulge 0.0 mm   timing 0.005 mm   anchor 0.000 mm
    //   bulge 0.8 mm   timing 0.005 mm   anchor 0.633 mm
    //   bulge 3.0 mm   timing 0.005 mm   anchor 1.719 mm
    //
    // The timing residual does not move at all, because every timing mark is
    // printed inside the left corner square's own band, where this deformation
    // is zero by construction.
    const { layout, flat } = sheet();
    const flatRead = probes(flat, layout);

    for (const bulgeMm of [0.8, 3]) {
      const read = probes(bent(layout, flat, bulgeMm), layout);
      expect(Math.abs(read.timingMm - flatRead.timingMm)).toBeLessThan(0.05);
      expect(read.anchors.kind).toBe('unstable');
      if (read.anchors.kind !== 'unstable') continue;
      expect(read.anchors.residualMm).toBeGreaterThan(MAX_X_RESIDUAL_MM);
    }
  });

  it('grows with the error instead of going blind past it', () => {
    // The property the escape ring asymmetry did not have, and the reason it was
    // refused as a gate: that probe is a band pass, it peaked at 0.8 mm and read
    // 0.0009 at 1.2 mm, so it would have called the dangerous case clean. This
    // one climbs while the mark is in the window and then loses the mark
    // entirely, which is a refusal and not a pass.
    const { layout, flat } = sheet();
    const measured: number[] = [];

    for (const bulgeMm of [0, 0.3, 0.8, 1.5, 3]) {
      const read = probes(bent(layout, flat, bulgeMm), layout);
      if (read.anchors.kind === 'ok') measured.push(read.anchors.residualMm);
      else if (read.anchors.kind === 'unstable') measured.push(read.anchors.residualMm);
      else throw new Error(`anchors said ${read.anchors.kind} at ${String(bulgeMm)} mm`);
    }

    for (let index = 1; index < measured.length; index += 1) {
      expect(measured[index] ?? 0).toBeGreaterThan(measured[index - 1] ?? 0);
    }
  });

  it('refuses a full bubble pitch of curl rather than reading it as a clean sheet', () => {
    // 5.6 mm is one bubble pitch at the default geometry: every disc lands on
    // its neighbour and every answer on the sheet is wrong, with no glare, no
    // escape, no saturation and a timing residual of 0.005 mm to show for it.
    // Measured here: 25 of 50 anchor marks are no longer findable at all.
    const { layout, flat } = sheet();
    const image = bent(layout, flat, 5.6);
    const read = probes(image, layout);
    expect(read.timingMm).toBeLessThan(0.05);
    expect(read.anchors.kind).toBe('missing');

    const result = scanSheet(image, { perturb: false });
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('anchors_missing');
  });

  it('refuses the smaller curl through the whole pipeline, and names the axis', () => {
    const { layout, flat } = sheet();
    const result = scanSheet(bent(layout, flat, 1.5), { perturb: false });
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('sheet_not_flat');
    if (result.reason.kind !== 'sheet_not_flat') return;
    // The axis is the difference between "flatten the paper" and "the paper is
    // curled the other way", which is the only thing the teacher can act on.
    expect(result.reason.axis).toBe('x');
  });

  it('reports an unavailable probe as absent and never as zero', () => {
    // No sheet the layout produces today lands here: the fit rule leaves at
    // least `sidebarGapMm` of blank band after the grid, which is exactly the
    // room an anchor needs, so every sheet gets one. The branch is kept and
    // tested because the alternative to reporting nothing would be reporting a
    // clean measurement, and that is a confident answer to a question nobody
    // was able to ask.
    const { layout, flat } = sheet();
    const found = findFiducials(flat);
    if (found.kind !== 'ok') throw new Error('no corners');
    const code = readSheetCode(flat, found.quad);
    if (code.kind !== 'ok') throw new Error('no code');
    const frame = paperFrame(code.corners, layout);
    if (frame === null) throw new Error('no frame');

    const read = readAnchors(flat, frame, { ...layout, anchorColumns: [] });
    expect(read.kind).toBe('none');
  });

  it('carries the residual out to the caller on a sheet that passes', () => {
    const { layout, flat } = sheet();
    const result = scanSheet(flat, { perturb: false });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.sheet.quality.anchorResidualMm).not.toBeNull();
    expect(result.sheet.quality.anchorResidualMm ?? 1).toBeLessThan(MAX_X_RESIDUAL_MM);
    expect(layout.anchorColumns.length).toBeGreaterThan(0);
  });
});
