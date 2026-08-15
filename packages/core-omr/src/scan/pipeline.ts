// The whole scan, in the order the sheet makes possible.
//
// Corner squares, then the code, then the geometry the code rebuilds, then the
// sheet's own photometric reference, then the timing marks, then every bubble.
// Each stage either produces the input the next one needs or returns a named
// refusal, and nothing downstream ever runs on a guess about what came before.
//
// Nothing is warped and nothing is resampled. The corner squares give a
// projective map between millimetres on the sheet and pixels in the frame, and
// every measurement is a set of millimetre positions pushed through it. That is
// the resolution of the contradiction the plan left open: no OpenCV, because a
// sheet carrying four solid squares at known millimetres and a code carrying its
// own geometry does not need a general document scanner, and warping the frame
// would cost a pass over millions of pixels in order to throw detail away.

import { GEOMETRY, layoutSheet } from '@transferchecker/sheet-spec';
import type { SheetLayout, SheetSpec } from '@transferchecker/sheet-spec';
import { readSheetCode } from '../code/index';
import { markOf } from '../decide/group';
import type { GroupOutcome } from '../decide/group';
import { DEFAULT_THRESHOLDS } from '../decide/thresholds';
import type { Thresholds } from '../decide/thresholds';
import { findFiducials } from '../geometry/fiducials';
import { fiducialSideMm, paperFrame } from '../geometry/frame';
import type { GrayImage } from '../image/gray';
import { readAnchors } from '../measure/anchor';
import { photometryOf } from '../measure/photometry';
import { readTimingMarks } from '../measure/timing';
import { groupsOf, identityOf, measureSheet } from './measure-sheet';
import type { GroupResult, SheetPass } from './measure-sheet';
import { perturbFrame, perturbationsFor } from './perturb';
import type { FieldReading, FieldState, QuestionReading, ScanResult } from './result';

/**
 * How far the printed corner square may measure from its 8 mm before the four
 * points are not one sheet's four points.
 *
 * [measured] Two percent, against a worst legitimate reading of 0.2 percent
 * over flat renders and photographs with tilt, blur, noise and shadow, and
 * against 38 percent on an A4 carrier holding two A5 sheets. Ten times the
 * noise and a fifth of the signal.
 */
const MAX_FIDUCIAL_ERROR = 0.02;

export interface ScanOptions {
  readonly thresholds?: Thresholds;
  /**
   * The template, for a sheet whose code carries only an identifier. A sheet
   * printed with the full code needs nothing here, which is the point of the
   * full code: a device that has never seen the template still grades the paper.
   */
  readonly template?: SheetSpec;
  /**
   * Re-measure under the perturbation set of defense د13 and downgrade anything
   * that does not survive it. On by default, because it is the mechanism that
   * makes acceptance criteria 12 and 13 true rather than hoped for. Turning it
   * off is a speed trade the caller owns, and it costs determinism.
   */
  readonly perturb?: boolean;
}

/** Which quarter of the sheet a group sits in, so glare can be pointed at. */
function quadrantOf(
  layout: SheetLayout,
  xMm: number,
  yMm: number,
): 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' {
  const left = xMm < layout.paper.widthMm / 2;
  const top = yMm < layout.paper.heightMm / 2;
  if (top) return left ? 'topLeft' : 'topRight';
  return left ? 'bottomLeft' : 'bottomRight';
}

function fieldStateOf(outcomes: readonly GroupOutcome[]): FieldState {
  if (outcomes.some((outcome) => outcome.kind === 'ambiguous')) return 'ambiguous';
  const blanks = outcomes.filter((outcome) => outcome.kind === 'blank').length;
  if (blanks === outcomes.length) return 'unset';
  return blanks === 0 ? 'ok' : 'partial';
}

/**
 * Marks every group whose reading changed under the perturbation set.
 *
 * A changed answer becomes ambiguous, because two readings of one photograph
 * disagreeing about the letter is precisely the case where guessing is
 * forbidden. A changed flag becomes uncertain, which surfaces it to the teacher
 * without pretending the letter is in doubt.
 */
function downgradeUnstable(base: SheetPass, others: readonly SheetPass[]): Set<string> {
  const unstable = new Set<string>();
  const baseline = new Map(groupsOf(base).map((group) => [group.id, identityOf(group.outcome)]));

  for (const pass of others) {
    for (const group of groupsOf(pass)) {
      if (baseline.get(group.id) !== identityOf(group.outcome)) unstable.add(group.id);
    }
  }
  return unstable;
}

function applyInstability(group: GroupResult, unstable: Set<string>): GroupOutcome {
  if (!unstable.has(group.id)) return group.outcome;
  const outcome = group.outcome;
  switch (outcome.kind) {
    case 'answer':
      return { ...outcome, uncertain: true };
    case 'multiple':
      return { ...outcome, uncertain: true };
    case 'blank':
      // A blank that is not stable is not the student's decision, it is ours.
      return { kind: 'ambiguous', reason: 'two_close', margin: outcome.margin };
    case 'ambiguous':
    case 'unmeasurable':
      return outcome;
  }
}

export function scanSheet(image: GrayImage, options: ScanOptions = {}): ScanResult {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;

  const found = findFiducials(image);
  if (found.kind !== 'ok') {
    return { kind: 'rejected', reason: { kind: 'no_sheet', candidates: found.candidates } };
  }

  const code = readSheetCode(image, found.quad);
  if (code.kind === 'too_small') {
    return { kind: 'rejected', reason: { kind: 'code_too_small', modulePx: code.modulePx } };
  }
  if (code.kind !== 'ok') return { kind: 'rejected', reason: { kind: 'code_unreadable' } };

  const spec =
    code.decoded.mode === 'full'
      ? code.decoded.spec
      : options.template?.templateId === code.decoded.templateId
        ? options.template
        : null;
  if (spec === null) {
    return {
      kind: 'rejected',
      reason: { kind: 'template_unknown', templateId: code.decoded.templateId },
    };
  }

  const planned = layoutSheet(spec);
  if (planned.kind !== 'ok') {
    return {
      kind: 'rejected',
      reason: { kind: 'not_this_geometry', area: planned.area, axis: planned.axis },
    };
  }
  const layout = planned.layout;

  const frame = paperFrame(code.corners, layout);
  if (frame === null) {
    return { kind: 'rejected', reason: { kind: 'not_this_geometry', area: 'sheet', axis: 'both' } };
  }

  // The corner squares are 8 mm of printed ink, and their size was never fed to
  // the solve, so it is the only thing about the map the map cannot absorb.
  const sideMm = fiducialSideMm(frame, layout, found.quad.sidesPx);
  if (Math.abs(sideMm - GEOMETRY.fiducialMm) / GEOMETRY.fiducialMm > MAX_FIDUCIAL_ERROR) {
    return { kind: 'rejected', reason: { kind: 'not_one_sheet', fiducialMm: sideMm } };
  }

  const timing = readTimingMarks(image, frame, layout);
  if (timing.kind === 'missing') {
    return {
      kind: 'rejected',
      reason: { kind: 'rows_missing', expected: timing.expected, found: timing.found },
    };
  }
  if (timing.kind !== 'ok') {
    return {
      kind: 'rejected',
      reason: { kind: 'sheet_not_flat', residualMm: timing.residualMm, axis: 'y' },
    };
  }

  // The horizontal axis, which nothing before the anchor marks could measure.
  // A sheet curled about a vertical axis solves its four corners exactly and
  // leaves the timing residual at zero, so this is the only stage that can
  // refuse it, and a sheet that prints no anchor at all is reported as
  // unmeasured rather than as measured and clean.
  const anchors = readAnchors(image, frame, layout);
  if (anchors.kind === 'missing') {
    return {
      kind: 'rejected',
      reason: { kind: 'anchors_missing', expected: anchors.expected, found: anchors.found },
    };
  }
  if (anchors.kind === 'unstable') {
    return {
      kind: 'rejected',
      reason: { kind: 'sheet_not_flat', residualMm: anchors.residualMm, axis: 'x' },
    };
  }

  const field = photometryOf(image, frame, layout, timing.marks);
  if (field === null) return { kind: 'rejected', reason: { kind: 'low_contrast', contrast: 0 } };

  const base = measureSheet(image, frame, field, timing.marks, layout, spec, thresholds);

  // Defense د10: glare rejects the FRAME, never the question. It is a property
  // of where the light and the phone are, and the next frame from a slightly
  // different angle is clean, so resolving it to "blank" would turn a lighting
  // accident into a student's answer.
  const blinded = groupsOf(base).filter((group) => group.outcome.kind === 'unmeasurable');
  const firstBlinded = blinded[0];
  if (firstBlinded !== undefined) {
    return {
      kind: 'rejected',
      reason: {
        kind: 'glare',
        quadrant: quadrantOf(layout, firstBlinded.xMm, firstBlinded.yMm),
        groups: blinded.length,
      },
    };
  }

  // Defense د13. Each member nudges the MAP, and everything that depends on the
  // map is then derived again, including the timing marks: reusing the base
  // pass's marks would leave every row correction identical under every member,
  // so nothing whose source is a mark centroid would be visible to criterion 12
  // at all, and the set would be testing half the pipeline while reporting on
  // all of it. The cost is one extra strip reading per member.
  const unstable =
    options.perturb === false
      ? new Set<string>()
      : downgradeUnstable(
          base,
          perturbationsFor(frame).map((nudge) => {
            const moved = perturbFrame(frame, nudge);
            const shifted = readTimingMarks(image, moved, layout);
            return measureSheet(
              image,
              moved,
              field,
              shifted.kind === 'ok' ? shifted.marks : timing.marks,
              layout,
              spec,
              thresholds,
            );
          }),
        );

  const questions: QuestionReading[] = base.questions.map((group) => ({
    question: Number(group.id.slice(2)),
    outcome: applyInstability(group, unstable),
  }));

  const fields: FieldReading[] = base.fields.map((grid) => {
    const outcomes = grid.columns.map((column) => applyInstability(column, unstable));
    const columns = outcomes.map((outcome) => (outcome.kind === 'answer' ? outcome.symbol : null));
    const declared = spec.headerFields.find((entry) => entry.id === grid.id);
    return {
      id: grid.id,
      usage: declared?.usage ?? 'other',
      state: fieldStateOf(outcomes),
      columns,
      text: columns.map((value) => value ?? '_').join(''),
    };
  });

  return {
    kind: 'ok',
    sheet: {
      templateId: spec.templateId,
      paper: spec.paper,
      questions,
      fields,
      marks: questions.map((entry) => markOf(entry.outcome)).join(''),
      quality: {
        modulePx: code.modulePx,
        timingResidualMm: timing.residualMm,
        rowsFound: timing.found,
        rowsExpected: timing.expected,
        anchorResidualMm: anchors.kind === 'ok' ? anchors.residualMm : null,
        contrast: field.contrast,
        blanks: questions.filter((entry) => entry.outcome.kind === 'blank').length,
        ambiguous: questions.filter((entry) => entry.outcome.kind === 'ambiguous').length,
        uncertain: questions.filter(
          (entry) =>
            (entry.outcome.kind === 'answer' || entry.outcome.kind === 'multiple') &&
            entry.outcome.uncertain,
        ).length,
        escaped: questions.filter(
          (entry) => entry.outcome.kind === 'answer' && entry.outcome.escaped,
        ).length,
      },
    },
  };
}
