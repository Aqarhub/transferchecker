// Reed-Solomon decoding for one QR block.
//
// Why this exists at all: without error correction any single damaged module
// rejects the sheet, and a rejection the teacher cannot act on is the failure
// mode this product is being built to avoid. Level M carries roughly fifteen
// percent redundancy, which is a fold or a smudge across the printed code.
//
// The algorithm is the textbook one: syndromes, Berlekamp-Massey for the error
// locator, Chien search for the error positions, Forney for the magnitudes.
// QR uses generator base zero, so the syndrome roots are 2^0 to 2^(ec-1).
//
// Every step that cannot prove its own result returns null. A miscorrection is
// worse than a rejection here, because it produces a payload that decodes to a
// plausible sheet with the wrong geometry.

import {
  gfAdd,
  gfDiv,
  gfExp,
  gfInverse,
  gfMul,
  polyAdd,
  polyDerivative,
  polyEval,
  polyMul,
  polyTrim,
} from './gf256';

/** Null when the block carries more damage than its check symbols can locate. */
export function correctBlock(codewords: readonly number[], ecCount: number): number[] | null {
  if (ecCount <= 0 || codewords.length <= ecCount || codewords.length > 255) return null;

  // Received polynomial, lowest degree first: the last codeword is the constant
  // term, which is the convention the rest of this file assumes.
  const received = [...codewords].reverse();

  const syndromes: number[] = [];
  let clean = true;
  for (let index = 0; index < ecCount; index += 1) {
    const value = polyEval(received, gfExp(index));
    if (value !== 0) clean = false;
    syndromes.push(value);
  }
  if (clean) return [...codewords];

  const locator = errorLocator(syndromes, ecCount);
  if (locator === null) return null;

  const positions = errorPositions(locator, received.length);
  if (positions?.length !== locator.length - 1) return null;

  const evaluator = polyTrim(polyMul(syndromes, locator).slice(0, ecCount));
  const derivative = polyDerivative(locator);

  for (const position of positions) {
    const root = gfInverse(gfExp(position));
    const denominator = polyEval(derivative, root);
    if (denominator === 0) return null;
    // Forney with generator base zero carries one power of the error locator,
    // which is what the leading gfExp(position) is.
    const magnitude = gfMul(gfExp(position), gfDiv(polyEval(evaluator, root), denominator));
    const previous = received[position];
    if (previous === undefined) return null;
    received[position] = gfAdd(previous, magnitude);
  }

  // A corrected block must satisfy every syndrome. Checking that is what
  // separates a real correction from a plausible looking miscorrection.
  for (let index = 0; index < ecCount; index += 1) {
    if (polyEval(received, gfExp(index)) !== 0) return null;
  }

  return received.reverse();
}

/**
 * Berlekamp-Massey. Returns the error locator polynomial, lowest degree first
 * and with a constant term of one, or null when the block is beyond repair.
 *
 * The register length is tracked separately from the polynomial's degree,
 * because the two are only equal once the algorithm has converged, and reading
 * the degree in its place is a subtle way to decode a wrong block.
 */
function errorLocator(syndromes: readonly number[], ecCount: number): number[] | null {
  let current: number[] = [1];
  let previous: number[] = [1];
  let registerLength = 0;
  let sinceUpdate = 1;
  let lastDiscrepancy = 1;

  for (let step = 0; step < ecCount; step += 1) {
    let discrepancy = syndromes[step] ?? 0;
    for (let index = 1; index <= registerLength; index += 1) {
      const coefficient = current[index];
      const syndrome = syndromes[step - index];
      if (coefficient === undefined || syndrome === undefined) continue;
      discrepancy = gfAdd(discrepancy, gfMul(coefficient, syndrome));
    }

    if (discrepancy === 0) {
      sinceUpdate += 1;
      continue;
    }

    const scale = gfDiv(discrepancy, lastDiscrepancy);
    const shifted = [
      ...new Array<number>(sinceUpdate).fill(0),
      ...previous.map((coefficient) => gfMul(coefficient, scale)),
    ];
    const before = current;
    current = polyAdd(current, shifted);

    if (2 * registerLength <= step) {
      registerLength = step + 1 - registerLength;
      previous = before;
      lastDiscrepancy = discrepancy;
      sinceUpdate = 1;
    } else {
      sinceUpdate += 1;
    }
  }

  const trimmed = polyTrim(current);
  if (registerLength === 0 || 2 * registerLength > ecCount) return null;
  // Convergence: a locator whose degree is short of the register length does
  // not describe this block, whatever it would go on to correct.
  if (trimmed.length - 1 !== registerLength) return null;
  return trimmed;
}

/**
 * Chien search. Returns the degree positions of the errors, or null when a root
 * falls outside the block, which means the locator does not describe it.
 */
function errorPositions(locator: readonly number[], length: number): number[] | null {
  const positions: number[] = [];
  for (let position = 0; position < 255; position += 1) {
    if (polyEval(locator, gfInverse(gfExp(position))) !== 0) continue;
    if (position >= length) return null;
    positions.push(position);
  }
  return positions;
}
