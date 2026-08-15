// Where the escape ring may sit, for one sheet's bubble metrics.
//
// The ring exists to catch ink that left its bubble (defense د9), so it has to
// hold nothing but paper when the student marked normally. Fixed multiples of
// the radius do not deliver that, and the arithmetic says so at both ends of
// what BubbleMetricsSchema permits:
//
//   r = 1.6 (the schema minimum), darkest theme stroke 0.32
//     the printed outline's outer edge is at 1.76 mm
//     a ring starting at 1.10 r starts at 1.76 mm: ZERO clearance, so every
//     bubble reports its own printed circle as ink that escaped
//
//   r = 3.5 (the schema maximum) at the minimum legal pitch of 2r + 1
//     the neighbour's ink starts at 4.34 mm
//     a ring ending at 1.40 r ends at 4.90 mm: it is 0.56 mm INSIDE the
//     neighbouring bubble, so every bubble reports the neighbour as its own spill
//
// Even the default r = 2 leaves 0.04 mm from its own outline, which is under a
// quarter of a pixel at the resolution the code needs. So the ring is clamped
// against both hazards per sheet, and when the clamp leaves nothing usable the
// channel is switched off and says it was switched off, rather than returning a
// number that means the printed furniture.

/**
 * Widest bubble outline the generator prints, in millimetres.
 *
 * From the 'dark' theme in sheet-pdf/src/theme.ts, which exists for printers
 * that lay down too little toner. The darkest is the one that matters here
 * because it is the one that reaches furthest into the ring. This is a coupling
 * between two packages that no type enforces, and it is stated here so that a
 * change to that theme has somewhere to be noticed.
 */
export const MAX_STROKE_MM = 0.32;

/** Paper that must remain between the ring and the printed ink on either side. */
const INNER_CLEARANCE_MM = 0.2;
const OUTER_CLEARANCE_MM = 0.35;

/** Below this the ring is too thin to hold a meaningful sample. */
const MIN_WIDTH_MM = 0.3;

export interface Ring {
  /** Inner and outer radius in units of the bubble radius. */
  readonly inner: number;
  readonly outer: number;
  /** False when the geometry leaves no room, and the escape channel is off. */
  readonly usable: boolean;
}

const UNUSABLE: Ring = { inner: 1.2, outer: 1.4, usable: false };

/**
 * The ring for a sheet whose bubbles have radius `rMm` and whose closest two
 * bubble centres are `minPitchMm` apart.
 */
export function ringFor(rMm: number, minPitchMm: number): Ring {
  if (rMm <= 0 || minPitchMm <= 0) return UNUSABLE;

  const innerMm = Math.max(1.2 * rMm, rMm + MAX_STROKE_MM / 2 + INNER_CLEARANCE_MM);
  const outerMm = Math.min(1.4 * rMm, minPitchMm - rMm - MAX_STROKE_MM / 2 - OUTER_CLEARANCE_MM);

  if (outerMm - innerMm < MIN_WIDTH_MM) return UNUSABLE;
  return { inner: innerMm / rMm, outer: outerMm / rMm, usable: true };
}
