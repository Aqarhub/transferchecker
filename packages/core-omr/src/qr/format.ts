// Format information and the data masks.
//
// The fifteen format bits carry the correction level and which of eight masks
// was applied, and they are printed twice so that a damaged corner still yields
// them. They are protected by a BCH(15,5) code, which is rebuilt here rather
// than tabulated: thirty-two constants copied by hand are thirty-two chances to
// be wrong, and the polynomial that generates them is three lines.

import type { QrMatrix } from '@transferchecker/sheet-spec';
import { EC_LEVELS } from './versions';
import type { EcLevel } from './versions';

const BCH_GENERATOR = 0x0537;
const FORMAT_MASK = 0x5412;
const FORMAT_BITS = 15;
/** Beyond this many wrong bits the read is damage, not a format we recognise. */
const MAX_FORMAT_DISTANCE = 3;

export interface FormatInfo {
  readonly level: EcLevel;
  readonly mask: number;
}

function bchRemainder(data: number): number {
  let value = data << 10;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if ((value & (1 << bit)) !== 0) value ^= BCH_GENERATOR << (bit - 10);
  }
  return value;
}

function buildFormatCodes(): number[] {
  return Array.from({ length: 32 }, (_, data) => ((data << 10) | bchRemainder(data)) ^ FORMAT_MASK);
}

const FORMAT_CODES = buildFormatCodes();

const bitCount = (value: number): number => {
  let count = 0;
  let rest = value;
  while (rest !== 0) {
    rest &= rest - 1;
    count += 1;
  }
  return count;
};

const dark = (matrix: QrMatrix, row: number, column: number): number =>
  matrix[row]?.[column] === true ? 1 : 0;

const readBits = (matrix: QrMatrix, positions: readonly (readonly [number, number])[]): number =>
  positions.reduce((bits, [row, column]) => (bits << 1) | dark(matrix, row, column), 0);

// Both lists run from the most significant bit of the BCH codeword to the
// least, which is the direction the specification numbers them in: bit 14 sits
// at row 8 column 0 and bit 0 at row 0 column 8. Reading them the other way
// round still lands within three bits of a different valid format, so getting
// this backwards does not fail loudly, it decodes the wrong correction level.

/** Positions of the copy that surrounds the top left finder. */
function topLeftPositions(): (readonly [number, number])[] {
  const positions: (readonly [number, number])[] = [];
  for (let column = 0; column < 6; column += 1) positions.push([8, column]);
  positions.push([8, 7], [8, 8], [7, 8]);
  for (let row = 5; row >= 0; row -= 1) positions.push([row, 8]);
  return positions;
}

/** Positions of the copy split between the other two finders. */
function splitPositions(size: number): (readonly [number, number])[] {
  const positions: (readonly [number, number])[] = [];
  for (let row = size - 1; row >= size - 7; row -= 1) positions.push([row, 8]);
  for (let column = size - 8; column < size; column += 1) positions.push([8, column]);
  return positions;
}

function nearestFormat(bits: number): FormatInfo | null {
  let best: number | null = null;
  let bestDistance = FORMAT_BITS + 1;
  for (const [data, code] of FORMAT_CODES.entries()) {
    const distance = bitCount(bits ^ code);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = data;
    } else if (distance === bestDistance) {
      // A tie means the read is equally close to two different formats, so
      // believing either of them would be a guess.
      best = null;
    }
  }
  if (best === null || bestDistance > MAX_FORMAT_DISTANCE) return null;

  const level = EC_LEVELS[(best >> 3) & 0x03];
  if (level === undefined) return null;
  return { level, mask: best & 0x07 };
}

/** Null when neither printed copy is close enough to a valid format. */
export function readFormat(matrix: QrMatrix, size: number): FormatInfo | null {
  return (
    nearestFormat(readBits(matrix, topLeftPositions())) ??
    nearestFormat(readBits(matrix, splitPositions(size)))
  );
}

/** True where the numbered mask inverts the module at this position. */
export function maskApplies(mask: number, row: number, column: number): boolean {
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return column % 3 === 0;
    case 3:
      return (row + column) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    case 5:
      return ((row * column) % 2) + ((row * column) % 3) === 0;
    case 6:
      return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    case 7:
      return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0;
    default:
      return false;
  }
}
