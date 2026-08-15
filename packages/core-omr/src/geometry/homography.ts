// The projective map between the sheet's millimetres and the frame's pixels.
//
// This is the whole of the "perspective correction" the plan asked for, and it
// is nine numbers rather than a warped copy of the image. Nothing is resampled:
// a bubble's disc is a set of points in millimetres, each one pushed through
// this map and read where it lands. A warped image would cost a full pass over
// several million pixels and would throw away detail at exactly the moment we
// need it, and it would make the answer depend on the resampling filter.

export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function project(m: Matrix3, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8];
  if (w === 0) return { x: Number.NaN, y: Number.NaN };
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

/** `a` applied after `b`, so `project(multiply(a, b), p)` is `a(b(p))`. */
export function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const out: number[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += (a[row * 3 + k] ?? 0) * (b[k * 3 + column] ?? 0);
      }
      out.push(sum);
    }
  }
  const [a0, a1, a2, b0, b1, b2, c0, c1, c2] = out;
  if (a0 === undefined || a1 === undefined || a2 === undefined) throw new Error('matrix3: short');
  if (b0 === undefined || b1 === undefined || b2 === undefined) throw new Error('matrix3: short');
  if (c0 === undefined || c1 === undefined || c2 === undefined) throw new Error('matrix3: short');
  return [a0, a1, a2, b0, b1, b2, c0, c1, c2];
}

export function invert(m: Matrix3): Matrix3 | null {
  const a = m[4] * m[8] - m[5] * m[7];
  const b = m[5] * m[6] - m[3] * m[8];
  const c = m[3] * m[7] - m[4] * m[6];
  const determinant = m[0] * a + m[1] * b + m[2] * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;

  const k = 1 / determinant;
  return [
    a * k,
    (m[2] * m[7] - m[1] * m[8]) * k,
    (m[1] * m[5] - m[2] * m[4]) * k,
    b * k,
    (m[0] * m[8] - m[2] * m[6]) * k,
    (m[2] * m[3] - m[0] * m[5]) * k,
    c * k,
    (m[1] * m[6] - m[0] * m[7]) * k,
    (m[0] * m[4] - m[1] * m[3]) * k,
  ];
}

/** Local scale of the map at a point: how many destination units one source unit spans. */
export function scaleAt(m: Matrix3, x: number, y: number): number {
  const here = project(m, x, y);
  const right = project(m, x + 1, y);
  const down = project(m, x, y + 1);
  const dx = Math.hypot(right.x - here.x, right.y - here.y);
  const dy = Math.hypot(down.x - here.x, down.y - here.y);
  return (dx + dy) / 2;
}

const at = (row: readonly number[] | undefined, index: number): number => {
  const value = row?.[index];
  if (value === undefined) throw new Error('homography: system row is short');
  return value;
};

/** Gaussian elimination with partial pivoting. Null when the system is singular. */
function solveLinear(system: number[][], size: number): number[] | null {
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(at(system[row], column)) > Math.abs(at(system[pivot], column))) pivot = row;
    }
    if (Math.abs(at(system[pivot], column)) < 1e-10) return null;

    const swap = system[column];
    const other = system[pivot];
    if (swap === undefined || other === undefined) return null;
    system[column] = other;
    system[pivot] = swap;

    const pivotRow = system[column];
    if (pivotRow === undefined) return null;
    const divisor = at(pivotRow, column);
    for (let index = column; index <= size; index += 1) {
      pivotRow[index] = at(pivotRow, index) / divisor;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const target = system[row];
      if (target === undefined) return null;
      const factor = at(target, column);
      if (factor === 0) continue;
      for (let index = column; index <= size; index += 1) {
        target[index] = at(target, index) - factor * at(pivotRow, index);
      }
    }
  }

  return Array.from({ length: size }, (_, row) => at(system[row], size));
}

/**
 * The homography carrying four source points onto four destination points.
 *
 * Four correspondences fix all eight degrees of freedom exactly, so there is no
 * residual to report here and none to trust. That is worth stating because it
 * is a trap: a wrong paper size still solves perfectly against its own four
 * corners. What catches that is the timing marks down the page, which this map
 * predicts and does not fit. See docs/CORE-OMR.md decision 6.
 */
export function homographyFrom(
  source: readonly Point[],
  destination: readonly Point[],
): Matrix3 | null {
  if (source.length !== 4 || destination.length !== 4) return null;

  const system: number[][] = [];
  for (let index = 0; index < 4; index += 1) {
    const from = source[index];
    const to = destination[index];
    if (from === undefined || to === undefined) return null;
    if (!Number.isFinite(from.x) || !Number.isFinite(to.x)) return null;
    system.push([from.x, from.y, 1, 0, 0, 0, -from.x * to.x, -from.y * to.x, to.x]);
    system.push([0, 0, 0, from.x, from.y, 1, -from.x * to.y, -from.y * to.y, to.y]);
  }

  const solution = solveLinear(system, 8);
  if (solution === null) return null;

  const [a, b, c, d, e, f, g, h] = solution;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  if (e === undefined || f === undefined || g === undefined || h === undefined) return null;
  if (![a, b, c, d, e, f, g, h].every((value) => Number.isFinite(value))) return null;
  return [a, b, c, d, e, f, g, h, 1];
}
