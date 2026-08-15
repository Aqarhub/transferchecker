// Measuring one bubble.
//
// Four numbers come out, not one, because a single mean cannot tell the three
// things apart that all read as "about half dark": a light but complete
// shading, a heavy mark covering half the bubble, and a bubble half destroyed by
// glare. Keeping the distribution is what lets defenses د9 and د10 exist at all.
//
// Two geometric decisions, both free once the coordinates are known
// (defense د9):
//
// The INNER DISC at 0.75 of the radius keeps the printed outline out of the
// measurement entirely. The outline is deliberately light so an empty bubble
// reads as paper, but light is not nothing, and it is the same fraction of every
// bubble, so it inflates every fill ratio by a constant that then has to be
// subtracted somewhere. Measuring inside it removes the constant instead.
//
// The ESCAPE RING from 1.1 to 1.4 radii holds no printed ink and no neighbouring
// bubble by construction: the nearest neighbour's edge is 3.6 mm away and the
// next row is 5 mm. Ink there means the mark left its bubble, which is the
// signature of a circled letter, a cross, a strike through and rough work, and
// it earns its own flag instead of dissolving into the fill ratio.

import type { Bubble } from '@transferchecker/sheet-spec';
import type { Frame } from '../geometry/frame';
import { toImage } from '../geometry/frame';
import { sampleAt } from '../image/gray';
import type { GrayImage } from '../image/gray';
import { inkRatio, referenceAt } from './photometry';
import type { PhotometricField } from './photometry';

export interface BubbleReading {
  /** Mean ink over the inner disc, 0 for paper and 1 for solid printed ink. */
  readonly fill: number;
  /** Fraction of the disc that is at least half ink. A light full shading and a
   *  heavy half mark have the same fill and very different coverage. */
  readonly coverage: number;
  /** Fraction of the disc reading brighter than the paper around it: glare. */
  readonly saturation: number;
  /** Mean ink in the escape ring: the mark that left its bubble. */
  readonly escape: number;
}

/** Ink at or above this fraction counts toward coverage. */
const COVERAGE_LEVEL = 0.5;

/**
 * How far above the locally expected paper white a pixel has to read before it
 * is glare rather than paper.
 *
 * Defense د10 describes the test as pixels at 0.95 of the locally expected
 * white, and taken literally that flags every empty bubble on every sheet,
 * because an empty bubble IS paper and paper reads at the expected white. It
 * was found by running it: an untouched sheet came back as 24 unmeasurable
 * groups. The signature that means something is an EXCESS over the paper around
 * it, which is what a specular highlight actually is: the graphite is a partly
 * mirrored surface, so under a point source the brightest spot on the page ends
 * up inside a shaded bubble.
 *
 * Four percent of the black to white span, with a floor of eight grey levels so
 * sensor noise on a low contrast frame cannot trip it.
 */
const EXCESS_FRACTION = 0.04;
const EXCESS_FLOOR = 8;

const INNER = 0.75;
const RING_INNER = 1.1;
const RING_OUTER = 1.4;

/**
 * The sample lattice, in units of the bubble radius.
 *
 * It is fixed in the sheet's own millimetres rather than in the frame's pixels,
 * and that is the whole of how this engine is deterministic. Two photographs of
 * one paper sample the same points on the paper, so the only difference between
 * them is what the sensor saw, not which pixels happened to fall inside a
 * circle. Acceptance criteria 12 and 13 rest on this one property.
 */
function latticeIn(step: number, low: number, high: number): { dx: number; dy: number }[] {
  const points: { dx: number; dy: number }[] = [];
  const reach = Math.ceil(high / step);
  for (let j = -reach; j <= reach; j += 1) {
    for (let i = -reach; i <= reach; i += 1) {
      const dx = i * step;
      const dy = j * step;
      const distance = Math.hypot(dx, dy);
      if (distance <= high && distance >= low) points.push({ dx, dy });
    }
  }
  return points;
}

const DISC = latticeIn(INNER / 8, 0, INNER);
const RING = latticeIn((RING_OUTER - RING_INNER) / 2.5, RING_INNER, RING_OUTER);

/** Where a choice letter is printed beside its bubble, so the ring is masked there. */
export type LabelSide = 'none' | 'left' | 'right';

export function measureBubble(
  image: GrayImage,
  frame: Frame,
  field: PhotometricField,
  bubble: Bubble,
  offsetYMm: number,
  labelSide: LabelSide,
): BubbleReading {
  const cx = bubble.cxMm;
  const cy = bubble.cyMm + offsetYMm;
  const reference = referenceAt(field, cx, cy);
  const glareLevel =
    reference.white + Math.max(EXCESS_FLOOR, EXCESS_FRACTION * (reference.white - reference.black));

  let total = 0;
  let covered = 0;
  let saturated = 0;
  let counted = 0;

  for (const point of DISC) {
    const xMm = cx + point.dx * bubble.rMm;
    const yMm = cy + point.dy * bubble.rMm;
    const at = toImage(frame, xMm, yMm);
    const value = sampleAt(image, at.x, at.y);
    const ink = inkRatio(reference, value);
    total += ink;
    if (ink >= COVERAGE_LEVEL) covered += 1;
    if (value >= glareLevel) saturated += 1;
    counted += 1;
  }

  let escapeTotal = 0;
  let escapeCount = 0;
  for (const point of RING) {
    // An external label sits inside the ring on one side, so that side is not
    // measured. Masking is cheaper than pretending the printed letter is a mark.
    if (labelSide === 'left' && point.dx < 0) continue;
    if (labelSide === 'right' && point.dx > 0) continue;
    const xMm = cx + point.dx * bubble.rMm;
    const yMm = cy + point.dy * bubble.rMm;
    const at = toImage(frame, xMm, yMm);
    escapeTotal += inkRatio(reference, sampleAt(image, at.x, at.y));
    escapeCount += 1;
  }

  return {
    fill: counted === 0 ? 0 : total / counted,
    coverage: counted === 0 ? 0 : covered / counted,
    saturation: counted === 0 ? 0 : saturated / counted,
    escape: escapeCount === 0 ? 0 : escapeTotal / escapeCount,
  };
}
