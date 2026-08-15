// Which modules carry data, and the order the data runs in.
//
// A QR symbol is not read row by row. The codewords zigzag up and down pairs of
// columns from the bottom right corner, stepping over everything that is
// structure rather than payload: the three finder patterns and their
// separators, the two timing lines, the alignment patterns, the dark module,
// the format bits and, from version 7, the version bits.

import type { QrMatrix } from '@transferchecker/sheet-spec';
import { maskApplies } from './format';
import { alignmentCentres, moduleCountOf } from './versions';

/** A grid marking every module that is structure rather than payload. */
export function functionPatternMap(version: number): boolean[][] {
  const size = moduleCountOf(version);
  const map = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const fill = (top: number, left: number, height: number, width: number): void => {
    for (let row = top; row < top + height; row += 1) {
      const line = map[row];
      if (line === undefined) continue;
      for (let column = left; column < left + width; column += 1) {
        if (column >= 0 && column < size) line[column] = true;
      }
    }
  };

  // Nine wide corner bands: the finder pattern, its separator, and the format
  // bits that sit against it, all of which are read elsewhere.
  fill(0, 0, 9, 9);
  fill(0, size - 8, 9, 8);
  fill(size - 8, 0, 8, 9);

  // Timing lines run the whole width and height; the corner bands already own
  // their ends.
  fill(6, 0, 1, size);
  fill(0, 6, size, 1);

  const centres = alignmentCentres(version);
  for (const row of centres) {
    for (const column of centres) {
      // The three positions that sit under a finder pattern are not printed.
      const atFinder =
        (row === 6 && column === 6) ||
        (row === 6 && column === size - 7) ||
        (row === size - 7 && column === 6);
      if (atFinder) continue;
      fill(row - 2, column - 2, 5, 5);
    }
  }

  if (version >= 7) {
    fill(0, size - 11, 6, 3);
    fill(size - 11, 0, 3, 6);
  }

  return map;
}

/**
 * Reads the payload codewords in symbol order, undoing the mask as it goes.
 *
 * Null when the modules that are supposed to carry data do not amount to the
 * codeword count this version and level expect, which means the matrix is not
 * the symbol it claims to be.
 *
 * The few bits left over at the end are the specification's remainder bits.
 * They carry nothing and no error correction protects them, so they are
 * dropped rather than checked: rejecting a sheet over a bit that means nothing
 * would be a refusal the teacher cannot act on.
 */
export function readCodewords(
  matrix: QrMatrix,
  version: number,
  mask: number,
  expectedCodewords: number,
): number[] | null {
  const size = moduleCountOf(version);
  const functions = functionPatternMap(version);
  const codewords: number[] = [];
  let current = 0;
  let bits = 0;
  let upward = true;
  let right = size - 1;

  while (right > 0) {
    // Column six is the vertical timing line. The pair steps over it rather
    // than skipping one of its own columns.
    if (right === 6) right -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset;
        if (functions[row]?.[column] === true) continue;
        const dark = matrix[row]?.[column] === true;
        const value = dark !== maskApplies(mask, row, column);
        current = (current << 1) | (value ? 1 : 0);
        bits += 1;
        if (bits === 8) {
          codewords.push(current);
          current = 0;
          bits = 0;
        }
      }
    }
    upward = !upward;
    right -= 2;
  }

  return codewords.length === expectedCodewords ? codewords : null;
}
