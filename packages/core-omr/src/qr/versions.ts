// The parts of the QR specification that are tables rather than algorithms.
//
// Versions 1 to 10 are carried, which is more than the sheet can print: the
// layout refuses a code wider than GEOMETRY.codeMaxSizeMm, and 30 mm at
// GEOMETRY.codeModuleMm of 0.5 mm with a four module quiet zone on each side
// leaves 52 modules, so version 8 (49 modules) is the largest sheet-spec can
// ever emit and version 9 (53) already overflows. The two extra versions are
// headroom, and a test in this package asserts the cap still holds so that
// raising it upstream fails loudly here rather than silently on a phone.
//
// Every row is checked by a test that rebuilds the version's total codeword
// count from its blocks, so a typo in this table cannot survive review.

/** Correction levels in the order their two format bits encode. */
export const EC_LEVELS = ['M', 'L', 'H', 'Q'] as const;
export type EcLevel = (typeof EC_LEVELS)[number];

export const MAX_VERSION = 10;

/** Data plus error correction codewords a whole symbol carries. */
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346] as const;

/** [ec codewords per block, group 1 blocks, group 1 data, group 2 blocks, group 2 data] */
type BlockRow = readonly [number, number, number, number, number];

const BLOCKS: Readonly<Record<EcLevel, readonly BlockRow[]>> = {
  L: [
    [7, 1, 19, 0, 0],
    [10, 1, 34, 0, 0],
    [15, 1, 55, 0, 0],
    [20, 1, 80, 0, 0],
    [26, 1, 108, 0, 0],
    [18, 2, 68, 0, 0],
    [20, 2, 78, 0, 0],
    [24, 2, 97, 0, 0],
    [30, 2, 116, 0, 0],
    [18, 2, 68, 2, 69],
  ],
  M: [
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37],
    [26, 4, 43, 1, 44],
  ],
  Q: [
    [13, 1, 13, 0, 0],
    [22, 1, 22, 0, 0],
    [18, 2, 17, 0, 0],
    [26, 2, 24, 0, 0],
    [18, 2, 15, 2, 16],
    [24, 4, 19, 0, 0],
    [18, 2, 14, 4, 15],
    [22, 4, 18, 2, 19],
    [20, 4, 16, 4, 17],
    [24, 6, 19, 2, 20],
  ],
  H: [
    [17, 1, 9, 0, 0],
    [28, 1, 16, 0, 0],
    [22, 2, 13, 0, 0],
    [16, 4, 9, 0, 0],
    [22, 2, 11, 2, 12],
    [28, 4, 15, 0, 0],
    [26, 4, 13, 1, 14],
    [26, 4, 14, 2, 15],
    [24, 4, 12, 4, 13],
    [28, 6, 15, 2, 16],
  ],
};

/** Row and column centres of the alignment patterns, version 2 upwards. */
const ALIGNMENT_CENTRES: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export interface BlockPlan {
  readonly ecPerBlock: number;
  /** One entry per block, in the order the symbol interleaves them. */
  readonly dataPerBlock: readonly number[];
  readonly totalCodewords: number;
}

/** Modules across a symbol of this version. */
export function moduleCountOf(version: number): number {
  return 17 + 4 * version;
}

/** The version a square module matrix belongs to, or null if it is not one. */
export function versionOfMatrix(size: number): number | null {
  if (size < 21 || size > moduleCountOf(MAX_VERSION)) return null;
  if ((size - 17) % 4 !== 0) return null;
  return (size - 17) / 4;
}

export function alignmentCentres(version: number): readonly number[] {
  return ALIGNMENT_CENTRES[version - 1] ?? [];
}

/** Null for a version outside the supported range. */
export function blockPlan(version: number, level: EcLevel): BlockPlan | null {
  const row = BLOCKS[level][version - 1];
  const total = TOTAL_CODEWORDS[version - 1];
  if (row === undefined || total === undefined) return null;

  const [ecPerBlock, group1, data1, group2, data2] = row;
  const dataPerBlock = [
    ...new Array<number>(group1).fill(data1),
    ...new Array<number>(group2).fill(data2),
  ];
  return { ecPerBlock, dataPerBlock, totalCodewords: total };
}
