// Locating the printed code's finder patterns from the sheet's own geometry.
//
// A general QR detector sweeps the image for the 1:1:3:1:1 run signature,
// because it has no idea where the symbol is. We do. Every sheet sheet-spec
// lays out puts the code's top-right corner a fixed distance from the top-right
// corner square, and the corner squares have already been found, so the
// top-right finder pattern's centre is arithmetic rather than search.
//
// That is not only simpler, it is what survives a hand held frame. A run length
// sweep needs the thin one module runs to survive thresholding, and at three to
// four pixels per module with a little blur they do not. A centroid over a
// window that already contains the pattern needs nothing thin to survive.
//
// The self correcting part is worth stating: a finder pattern is symmetric
// about its own centre, and it is surrounded by a one module separator of white
// paper, so the centre of mass of the ink inside a window centred anywhere near
// it is pulled toward the true centre. Two passes converge.

import { GEOMETRY } from '@transferchecker/sheet-spec';
import type { Frame } from '../geometry/frame';
import { toImage } from '../geometry/frame';
import { sampleAt } from '../image/gray';
import type { GrayImage } from '../image/gray';

export interface Centre {
  readonly xMm: number;
  readonly yMm: number;
}

/** Half the width of a finder pattern, in millimetres: 3.5 modules. */
export const FINDER_HALF_MM = 3.5 * GEOMETRY.codeModuleMm;

/**
 * Window half widths for the successive refinement passes.
 *
 * The pattern is 3.5 mm across and a one module separator of white paper
 * surrounds it, so a window may reach 0.5 mm past the pattern and no further.
 * Reaching further is not a harmless generosity: past the separator lies the
 * symbol's own data, which is dark on two sides of the top-left pattern and on
 * none of the top-right one, so the centre of mass gets pulled down and to the
 * right by a fraction of a module. It cost a fifth of a millimetre, the module
 * grid inherited it, and the payload came back through its own error correction
 * as a different valid codeword.
 */
const PASSES = [FINDER_HALF_MM + 0.5, FINDER_HALF_MM + 0.25, FINDER_HALF_MM + 0.12];

/** Samples per millimetre inside a refinement window. */
const GRAIN = 8;

interface Window {
  readonly values: number[];
  readonly span: number;
  readonly low: number;
  readonly high: number;
}

function readWindow(image: GrayImage, frame: Frame, centre: Centre, halfMm: number): Window | null {
  const span = Math.max(6, Math.round(2 * halfMm * GRAIN));
  const values: number[] = [];
  let low = 255;
  let high = 0;

  for (let row = 0; row < span; row += 1) {
    const yMm = centre.yMm - halfMm + ((row + 0.5) / span) * 2 * halfMm;
    for (let column = 0; column < span; column += 1) {
      const xMm = centre.xMm - halfMm + ((column + 0.5) / span) * 2 * halfMm;
      const at = toImage(frame, xMm, yMm);
      if (at.x < 0 || at.y < 0 || at.x > image.width - 1 || at.y > image.height - 1) return null;
      const value = sampleAt(image, at.x, at.y);
      if (value < low) low = value;
      if (value > high) high = value;
      values.push(value);
    }
  }

  return high - low < 24 ? null : { values, span, low, high };
}

/**
 * Re-centres on the ink inside a window around `guess`.
 *
 * Null when the window holds no contrast, or when the ink covers too little or
 * too much of it to be a finder pattern. The bounds come from the pattern
 * itself: 33 of its 49 modules are dark, which over a window a little larger
 * than the pattern is between a third and two thirds of the area.
 */
export function refineFinder(image: GrayImage, frame: Frame, guess: Centre): Centre | null {
  let centre = guess;

  for (const halfMm of PASSES) {
    const window = readWindow(image, frame, centre, halfMm);
    if (window === null) return null;

    const cut = (window.low + window.high) / 2;
    let weight = 0;
    let sumX = 0;
    let sumY = 0;
    for (const [index, value] of window.values.entries()) {
      if (value > cut) continue;
      const row = Math.floor(index / window.span);
      const column = index - row * window.span;
      weight += 1;
      sumX += centre.xMm - halfMm + ((column + 0.5) / window.span) * 2 * halfMm;
      sumY += centre.yMm - halfMm + ((row + 0.5) / window.span) * 2 * halfMm;
    }

    const coverage = weight / window.values.length;
    if (coverage < 0.28 || coverage > 0.72) return null;
    centre = { xMm: sumX / weight, yMm: sumY / weight };
  }

  return centre;
}

/**
 * Confirms a refined centre really is a finder pattern.
 *
 * Seven samples across the middle of the pattern, one per module, must read
 * dark, light, dark, dark, dark, light, dark. This is the same 1:1:3:1:1
 * signature a general detector hunts for, checked at module centres instead of
 * by run lengths, which is why blur does not take it away.
 */
export function looksLikeFinder(image: GrayImage, frame: Frame, centre: Centre): boolean {
  const module = GEOMETRY.codeModuleMm;
  const wanted = [true, false, true, true, true, false, true];

  // Each of the seven points is the mean of three samples across the middle of
  // its module, so a refined centre that is a quarter of a module out does not
  // put a sample on a module edge and flip it.
  const along = (dx: number, dy: number): number[] =>
    [-3, -2, -1, 0, 1, 2, 3].map((step) => {
      let sum = 0;
      for (const jitter of [-0.2, 0, 0.2]) {
        const offset = (step + jitter) * module;
        const at = toImage(frame, centre.xMm + dx * offset, centre.yMm + dy * offset);
        sum += sampleAt(image, at.x, at.y);
      }
      return sum / 3;
    });

  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ]) {
    const line = along(dx ?? 0, dy ?? 0);
    const low = Math.min(...line);
    const high = Math.max(...line);
    if (high - low < 24) return false;
    const cut = (low + high) / 2;
    // One disagreement out of seven is allowed. This is a sanity check on a
    // centre the centroid already found, not the detector itself, and making it
    // absolute rejected a correct symbol whose centre was a tenth of a
    // millimetre out.
    let wrong = 0;
    for (const [index, value] of line.entries()) {
      if (value <= cut !== wanted[index]) wrong += 1;
    }
    if (wrong > 1) return false;
  }
  return true;
}
