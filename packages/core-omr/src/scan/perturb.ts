// The deterministic perturbation set.
//
// Defense د13, and it replaces a rule that does not do what it promises. The
// plan's rule 3 accepts a scan when three consecutive frames agree, which is
// evidence only when the frames differ. A phone resting on a book under a fixed
// lamp produces three nearly identical frames, so three agreeing frames prove
// that the camera did not move, and a specular highlight sitting inside a
// shaded bubble is in every one of them.
//
// So agreement is required between deliberately different readings of the SAME
// frame instead. The sample lattice is fixed on the paper, so nudging the map
// between paper and sensor moves every sample point and asks whether the answer
// depended on exactly where the lattice landed. A bubble whose reading survives
// all of them was never close to a threshold. A bubble that flips was decided by
// sub-pixel luck, and saying so is the honest output.
//
// The set is fixed and ordered, never random, because acceptance criterion 13
// compares two runs for equality and a random probe would make that comparison
// meaningless.
//
// ON THE SIZE OF THE NUDGE, which د13 states as plus or minus 1.5 degrees and
// 2 percent of scale. Applied to the SAMPLING FRAME those numbers are far too
// large, and this was found by running them: 1.5 degrees about the centre of an
// A4 page moves a corner bubble by 2.3 mm, which is half a bubble, so every
// question on the sheet came back unstable. The reason is that a 1.5 degree
// camera tilt is not a perturbation of the sampling frame at all. The four
// corner squares absorb it exactly, because four correspondences fix all eight
// degrees of freedom of a homography.
//
// What is genuinely uncertain is the REGISTRATION: where the four corner centres
// were measured, which is good to a fraction of a pixel on a clean frame and
// about a pixel on a noisy one. So the set is defined as a registration error of
// a fixed number of pixels at the page corner, expressed three ways, and it is
// computed from the frame so it means the same thing at any resolution.
//
// د13's own numbers keep their place: they belong to re-photographing the sheet
// at a different angle and scale, which is acceptance criterion 13 tested at the
// image level, and the test suite does exactly that.

import { multiply, project } from '../geometry/homography';
import type { Matrix3 } from '../geometry/homography';
import type { Frame } from '../geometry/frame';

/**
 * How far the registration is assumed to be uncertain, at the page corner, in
 * frame pixels. Measured on synthetic sheets the corner centroid lands within
 * about a third of a pixel; this is several times that, so it is a real probe
 * rather than a formality.
 */
export const DRIFT_PX = 1.5;

export interface Nudge {
  /** Rotation about the sheet's centre, in degrees. */
  readonly angleDeg: number;
  /** Uniform scale about the sheet's centre. */
  readonly scale: number;
  /** Translation in frame pixels. */
  readonly dx: number;
  readonly dy: number;
}

/**
 * The set, sized for one particular frame.
 *
 * Six members: a rotation each way, a scale each way, and a translation on each
 * axis, all of which displace the page corner by `DRIFT_PX`.
 */
export function perturbationsFor(frame: Frame): readonly Nudge[] {
  const cornerRadiusPx =
    0.5 * Math.hypot(frame.spanXMm, frame.spanYMm) * Math.max(0.01, frame.pxPerMm);
  const fraction = DRIFT_PX / cornerRadiusPx;
  const angleDeg = (fraction * 180) / Math.PI;

  return [
    { angleDeg, scale: 1, dx: 0, dy: 0 },
    { angleDeg: -angleDeg, scale: 1, dx: 0, dy: 0 },
    { angleDeg: 0, scale: 1 + fraction, dx: 0, dy: 0 },
    { angleDeg: 0, scale: 1 - fraction, dx: 0, dy: 0 },
    { angleDeg: 0, scale: 1, dx: DRIFT_PX, dy: 0 },
    { angleDeg: 0, scale: 1, dx: 0, dy: DRIFT_PX },
  ];
}

/**
 * Nudges the map between the sheet and the frame.
 *
 * The disturbance is applied in the frame's own pixels, about the point the
 * sheet's centre projects to, because that is where a real registration error
 * pivots.
 */
export function perturbFrame(frame: Frame, nudge: Nudge): Frame {
  const centre = project(frame.toImage, frame.spanXMm / 2, frame.spanYMm / 2);
  const radians = (nudge.angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians) * nudge.scale;
  const sin = Math.sin(radians) * nudge.scale;

  // Translate to the centre, rotate and scale, translate back, then shift.
  const about: Matrix3 = [
    cos,
    -sin,
    centre.x - cos * centre.x + sin * centre.y + nudge.dx,
    sin,
    cos,
    centre.y - sin * centre.x - cos * centre.y + nudge.dy,
    0,
    0,
    1,
  ];

  // The inverse is not recomputed because no measurement runs backwards: every
  // one of them starts from millimetres on the sheet and projects forwards.
  return { ...frame, toImage: multiply(about, frame.toImage) };
}
