// The edge marks, measured against the failure they exist for.
//
// Everything here is run on a sheet with a curl injected into it: a cylinder
// about a vertical axis, flat at the two columns the corner squares are printed
// in and bulging in between. That deformation is the one the corner solve is
// blind to by construction, so a claim about it can only be made by producing
// it.
//
// Version 5 changed the answer to a curl, not just the instrument. Version 4
// could only refuse one; the edge marks measure it, and what they measure
// within the model's reach is corrected, so a modest curl now GRADES, and the
// letters have to prove it by matching the flat sheet's.
//
// The numbers in the comments are measured by this file on this repository, not
// quoted from anywhere.

import { describe, expect, it } from 'vitest';
import { GEOMETRY, layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import type { SheetLayout, SheetSpec } from '@transferchecker/sheet-spec';
import { readSheetCode } from '../src/code/index';
import { findFiducials } from '../src/geometry/fiducials';
import { paperFrame } from '../src/geometry/frame';
import { MAX_DISPLACEMENT_MM, readEdgeMarks, warpFrom } from '../src/measure/edge';
import { scanSheet } from '../src/scan/pipeline';
import { bendSheet } from '../tools/bend';
import { renderSheet } from '../tools/render';
import type { PencilMark } from '../tools/render';
import type { GrayImage } from '../src/image/gray';

const TEXT = {
  name: 'Standard 50',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

const PX_PER_MM = 10;

/** One answer on every question, so a registration failure has letters to move. */
function answers(layout: SheetLayout): PencilMark[] {
  const letters = ['A', 'B', 'C', 'D'];
  return layout.questionColumns.flatMap((column) =>
    column.rows.map((row) => ({
      groupId: `q:${String(row.question)}`,
      symbol: letters[row.question % letters.length] ?? 'A',
      coverage: 1,
      value: 60,
    })),
  );
}

function sheet(): { spec: SheetSpec; layout: SheetLayout; flat: GrayImage } {
  const spec = stockTemplate('standard50', TEXT);
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') throw new Error('the stock sheet did not lay out');
  const layout = result.layout;
  return {
    spec,
    layout,
    flat: renderSheet(layout, { pxPerMm: PX_PER_MM, marks: answers(layout) }),
  };
}

/** The same sheet with a curl of `bulgeMm` at the middle of the page. */
function bent(layout: SheetLayout, flat: GrayImage, bulgeMm: number): GrayImage {
  // The whole page, which is what a cylinder about a vertical axis does to
  // real paper, and the shape the transfinite correction models exactly.
  return bendSheet(flat, {
    pxPerMm: PX_PER_MM,
    bulgeMm,
    leftMm: GEOMETRY.marginSideMm + GEOMETRY.fiducialMm / 2,
    rightMm: layout.paper.widthMm - GEOMETRY.marginSideMm - GEOMETRY.fiducialMm / 2,
    fromYMm: -20,
  });
}

/** Reads the edge marks off one image, through the real pipeline stages. */
function marksOf(image: GrayImage, layout: SheetLayout): ReturnType<typeof readEdgeMarks> {
  const found = findFiducials(image);
  if (found.kind !== 'ok') throw new Error('the corner squares moved, which is not this test');
  const code = readSheetCode(image, found.quad);
  if (code.kind !== 'ok') throw new Error('the code moved, which is not this test');
  const frame = paperFrame(code.corners, layout);
  if (frame === null) throw new Error('no frame');
  return readEdgeMarks(image, frame, layout);
}

describe('the edge marks measure what the corners cannot', () => {
  it('read clean on a flat sheet, and the correction is nothing anywhere', () => {
    const { layout, flat } = sheet();
    const read = marksOf(flat, layout);
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;
    expect(read.residualMm).toBeLessThan(0.05);

    const warp = warpFrom(layout, read.marks);
    for (const [xMm, yMm] of [
      [105, 150],
      [40, 60],
      [170, 250],
    ] as const) {
      const correction = warp.at(xMm, yMm);
      expect(Math.hypot(correction.dxMm, correction.dyMm)).toBeLessThan(0.1);
    }
  });

  it('sees the curl grow instead of going blind past it', () => {
    // The property the escape ring asymmetry did not have, and the reason it
    // was refused as a gate: that probe peaked at 0.8 mm and read 0.0009 at
    // 1.2 mm, so it would have called the dangerous case clean. This one
    // climbs while the marks are in their windows, and then loses a mark
    // entirely, which is a refusal and not a pass.
    const { layout, flat } = sheet();
    const measured: number[] = [];

    for (const bulgeMm of [0, 0.4, 0.9, 1.4]) {
      const read = marksOf(bent(layout, flat, bulgeMm), layout);
      if (read.kind === 'ok' || read.kind === 'unstable') measured.push(read.residualMm);
      else throw new Error(`marks said ${read.kind} at ${String(bulgeMm)} mm`);
    }

    for (let index = 1; index < measured.length; index += 1) {
      expect(measured[index] ?? 0).toBeGreaterThan(measured[index - 1] ?? 0);
    }
  });

  it('grades a modest curl, and the letters match the flat sheet', () => {
    // This is what version 4 could not do: it refused this sheet. The marks
    // measure the displacement, the warp pulls every sample lattice back onto
    // its bubbles, and the proof is that every letter matches the flat read.
    const { layout, flat } = sheet();
    const clean = scanSheet(flat, { perturb: false });
    expect(clean.kind).toBe('ok');

    const result = scanSheet(bent(layout, flat, 1.2), { perturb: false });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok' || clean.kind !== 'ok') return;
    expect(result.sheet.marks).toBe(clean.sheet.marks);
    expect(result.sheet.quality.edgeResidualMm).toBeGreaterThan(0.1);
  });

  it('refuses a curl past the model, and names the axis', () => {
    const { layout, flat } = sheet();
    const result = scanSheet(bent(layout, flat, 2.5), { perturb: false });
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('sheet_not_flat');
    if (result.reason.kind !== 'sheet_not_flat') return;
    // The axis is the difference between "flatten the paper" and "the paper is
    // curled the other way", which is the only thing the teacher can act on.
    expect(result.reason.axis).toBe('x');
  });

  it('refuses a full bubble pitch of curl rather than reading it as a clean sheet', () => {
    // 5.6 mm is one bubble pitch at the default geometry: every disc lands on
    // its neighbour and every answer on the sheet is wrong. The sliver of the
    // displaced mark still inside its window measures as an enormous
    // displacement, so the sheet is refused as not flat, which is the truth.
    const { layout, flat } = sheet();
    const result = scanSheet(bent(layout, flat, 5.6), { perturb: false });
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('sheet_not_flat');
  });

  it('carries the residual out to the caller on a sheet that passes', () => {
    const { layout, flat } = sheet();
    const result = scanSheet(flat, { perturb: false });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.sheet.quality.edgeResidualMm).toBeLessThan(MAX_DISPLACEMENT_MM);
    expect(layout.edgeMarks).toHaveLength(4);
  });
});
