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
// The ESCAPE RING holds no printed ink and no neighbouring bubble, so ink there
// means the mark left its bubble: the signature of a circled letter, a cross, a
// strike through and rough work, and it earns its own flag instead of dissolving
// into the fill ratio. Where the ring may sit is not a fixed multiple of the
// radius; it is clamped per sheet against the bubble's own printed outline and
// against the neighbour's, and ring.ts explains why with the arithmetic.

import type { Bubble } from '@transferchecker/sheet-spec';
import type { Frame } from '../geometry/frame';
import { toImage } from '../geometry/frame';
import { sampleAt } from '../image/gray';
import type { GrayImage } from '../image/gray';
import { inkRatio, referenceAt } from './photometry';
import type { PhotometricField } from './photometry';
import { MAX_STROKE_MM } from './ring';
import type { Ring } from './ring';

export interface BubbleReading {
  /**
   * Mean ink over the bubble, 0 for paper and 1 for solid printed ink.
   *
   * Two discs are measured and the larger mean wins, so that a mark drawn AT the
   * bubble's edge rather than across its middle is still a mark. See `WIDE_MAX`.
   */
  readonly fill: number;
  /**
   * The paper to toner separation this bubble's ink was measured against, in
   * grey levels.
   *
   * Carried because `fill` is a fraction of it, and the same fraction is a
   * different physical amount of ink on a fresh sheet and on a third generation
   * photocopy. The decision needs both: a fraction of this sheet, and an
   * absolute darkening that no amount of weak toner can inflate.
   */
  readonly spanLevels: number;
  /** Fraction of the disc that is at least half ink. A light full shading and a
   *  heavy half mark have the same fill and very different coverage. */
  readonly coverage: number;
  /** Fraction of the disc reading brighter than the paper around it: glare. */
  readonly saturation: number;
  /** Mean ink in the escape ring: the mark that left its bubble. */
  readonly escape: number;
  /**
   * False when this sheet's geometry leaves no room for a ring that holds only
   * paper, in which case `escape` means nothing and no decision may use it.
   */
  readonly escapeMeasured: boolean;
  /**
   * How lopsided the ring's ink is, left against right and top against bottom.
   *
   * This is the sheet's only per bubble registration probe. A registration
   * error puts the ring's inner band on the printed outline on one side and on
   * clean paper on the other, and the outline is printed on EVERY bubble of
   * every placement, unlike the letter inside it. Per bubble it is noise and a
   * circled letter moves it; over a whole sheet its median is a measurement.
   *
   * It matters because nothing else on the sheet can see a sideways error at
   * all: every timing mark sits at one x, a millimetre from the two corners the
   * homography already pins exactly, so a curl about a vertical axis reports a
   * residual near zero while the middle of the page walks off its bubbles.
   */
  readonly asymX: number;
  readonly asymY: number;
  /** False where a printed label masks one side of the ring, so asymX means nothing. */
  readonly asymXMeasured: boolean;
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

/**
 * The outer edge of the SECOND disc, and the blind band it exists to close.
 *
 * THE FIRST REAL PAPER IS WHY THIS IS HERE. `INNER` keeps the printed outline
 * out of the measurement, and that is right, but it also means nothing measures
 * the band between 0.75 r and the outline itself. On the default 2 mm bubble
 * that band is 1.50 mm to 1.84 mm of radius, and it is exactly where a person
 * who CIRCLES a bubble instead of shading it puts their ink: a traced loop lives
 * on the printed ring, so the inner disc sees almost none of it and the escape
 * ring, which starts further out at 1.2 r, sees none of it either. The mark was
 * read as an empty bubble, silently. [measured] on photographed sheets.
 *
 * So a wider disc is measured as well and `fill` is the LARGER of the two means.
 * A larger disc is not a looser one: for an empty bubble the added annulus is
 * clean paper, so the wide mean comes out BELOW the narrow one and the maximum
 * keeps the narrow value unchanged. It only rises where the ink is genuinely out
 * at the edge, which is the case that was being lost.
 *
 * The edge is clamped off the printed outline with the same 0.2 mm of paper
 * `ring.ts` insists on, and for the same reason: the outline is printed on every
 * bubble of every sheet, so letting it into the measurement would inflate every
 * reading by a constant instead of measuring a mark.
 */
const WIDE_MAX = 0.85;
const WIDE_CLEARANCE_MM = 0.2;

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

/** One sample point, carrying whether it belongs to the inner disc as well. */
interface DiscPoint {
  readonly dx: number;
  readonly dy: number;
  readonly inner: boolean;
}

/**
 * The two discs as ONE lattice walked once.
 *
 * Two loops would sample the inner points twice, and the wider disc is only
 * about a fifth more points than the narrow one, so the second reading is nearly
 * free. Sharing the lattice also keeps the two means commensurable: the same
 * step, the same points, the same order.
 *
 * The step stays `INNER / 8` so every point the old single disc sampled is still
 * sampled at the same place. `fill` on a sheet with no ink at its bubble edges
 * is therefore not merely close to what it was, it is the same number.
 */
const DISC_CACHE = new Map<number, DiscPoint[]>();

function discFor(rMm: number): DiscPoint[] {
  const cached = DISC_CACHE.get(rMm);
  if (cached !== undefined) return cached;

  // How far out the wide disc may reach without touching the printed outline,
  // whose inner edge sits at rMm - MAX_STROKE_MM / 2.
  const clearMm = rMm - MAX_STROKE_MM / 2 - WIDE_CLEARANCE_MM;
  const wide = rMm > 0 ? Math.min(WIDE_MAX, clearMm / rMm) : INNER;
  // A bubble too small to hold a second disc keeps one, rather than borrowing
  // its own outline. Below about 1.44 mm of radius there is no room.
  const outer = Math.max(INNER, wide);

  const built = latticeIn(INNER / 8, 0, outer).map((point) => ({
    ...point,
    inner: Math.hypot(point.dx, point.dy) <= INNER,
  }));
  DISC_CACHE.set(rMm, built);
  return built;
}

// The ring is clamped per sheet, so its lattice is not a constant. It is built
// once per distinct geometry rather than per bubble, because a hundred question
// sheet measures 540 bubbles seven times over.
const RING_CACHE = new Map<string, { dx: number; dy: number }[]>();

function ringLattice(ring: Ring): { dx: number; dy: number }[] {
  const key = `${ring.inner.toFixed(3)}:${ring.outer.toFixed(3)}`;
  const cached = RING_CACHE.get(key);
  if (cached !== undefined) return cached;
  const built = latticeIn((ring.outer - ring.inner) / 2.5, ring.inner, ring.outer);
  RING_CACHE.set(key, built);
  return built;
}

/** Where a choice letter is printed beside its bubble, so the ring is masked there. */
export type LabelSide = 'none' | 'left' | 'right';

export function measureBubble(
  image: GrayImage,
  frame: Frame,
  field: PhotometricField,
  bubble: Bubble,
  offsetYMm: number,
  labelSide: LabelSide,
  ring: Ring,
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
  let wideTotal = 0;
  let wideCount = 0;

  for (const point of discFor(bubble.rMm)) {
    const xMm = cx + point.dx * bubble.rMm;
    const yMm = cy + point.dy * bubble.rMm;
    const at = toImage(frame, xMm, yMm);
    const value = sampleAt(image, at.x, at.y);
    const ink = inkRatio(reference, value);
    wideTotal += ink;
    wideCount += 1;
    // COVERAGE AND SATURATION STAY ON THE INNER DISC. Both are calibrated
    // against thresholds measured there, and د10's glare test in particular
    // means "the middle of this bubble is a mirror", which is not a claim the
    // edge can make.
    if (!point.inner) continue;
    total += ink;
    if (ink >= COVERAGE_LEVEL) covered += 1;
    if (value >= glareLevel) saturated += 1;
    counted += 1;
  }

  let escapeTotal = 0;
  let escapeCount = 0;
  const half = { left: 0, right: 0, top: 0, bottom: 0 };
  const seen = { left: 0, right: 0, top: 0, bottom: 0 };

  for (const point of ring.usable ? ringLattice(ring) : []) {
    // An external label sits inside the ring on one side, so that side is not
    // measured. Masking is cheaper than pretending the printed letter is a mark.
    if (labelSide === 'left' && point.dx < 0) continue;
    if (labelSide === 'right' && point.dx > 0) continue;
    const xMm = cx + point.dx * bubble.rMm;
    const yMm = cy + point.dy * bubble.rMm;
    const at = toImage(frame, xMm, yMm);
    const ink = inkRatio(reference, sampleAt(image, at.x, at.y));
    escapeTotal += ink;
    escapeCount += 1;

    if (point.dx > 0) {
      half.right += ink;
      seen.right += 1;
    } else if (point.dx < 0) {
      half.left += ink;
      seen.left += 1;
    }
    if (point.dy > 0) {
      half.bottom += ink;
      seen.bottom += 1;
    } else if (point.dy < 0) {
      half.top += ink;
      seen.top += 1;
    }
  }

  const meanOf = (sum: number, count: number): number => (count === 0 ? 0 : sum / count);
  const asymXMeasured = ring.usable && labelSide === 'none' && seen.left > 0 && seen.right > 0;

  // The larger of the two means. See WIDE_MAX for why a wider disc cannot make
  // an empty bubble read as marked, and why the winner is never below the floor
  // the narrow disc alone would have produced. The group outcome as a whole is
  // NOT monotone in fill, though, and that is worth saying rather than assuming:
  // raising one reading can change which bubble wins a row.
  const narrowFill = counted === 0 ? 0 : total / counted;
  const wideFill = wideCount === 0 ? 0 : wideTotal / wideCount;

  return {
    fill: Math.max(narrowFill, wideFill),
    spanLevels: Math.max(0, reference.white - reference.black),
    coverage: counted === 0 ? 0 : covered / counted,
    saturation: counted === 0 ? 0 : saturated / counted,
    escape: escapeCount === 0 ? 0 : escapeTotal / escapeCount,
    escapeMeasured: ring.usable && escapeCount > 0,
    asymX: asymXMeasured ? meanOf(half.right, seen.right) - meanOf(half.left, seen.left) : 0,
    asymY:
      ring.usable && seen.top > 0 && seen.bottom > 0
        ? meanOf(half.bottom, seen.bottom) - meanOf(half.top, seen.top)
        : 0,
    asymXMeasured,
  };
}
