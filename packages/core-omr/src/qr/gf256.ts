// Arithmetic in GF(256), the field a QR symbol's Reed-Solomon coding lives in.
//
// The field is fixed by the QR specification: the primitive polynomial is
// x^8 + x^4 + x^3 + x^2 + 1 and the generator is 2. Nothing here is a choice we
// made, so nothing here may be tuned.
//
// Table lookups are written through accessors rather than indexed directly,
// because noUncheckedIndexedAccess types every array read as possibly missing
// and a silent `?? 0` would turn an out of range index into a wrong answer
// instead of a crash. An out of range index here is a programming error.

const PRIMITIVE = 0x011d;
const ORDER = 255;

function buildExponents(): Uint8Array {
  // Doubled so that a sum of two logarithms never needs a modulo.
  const exp = new Uint8Array(2 * ORDER);
  let value = 1;
  for (let power = 0; power < ORDER; power += 1) {
    exp[power] = value;
    exp[power + ORDER] = value;
    value <<= 1;
    if (value >= 256) value ^= PRIMITIVE;
  }
  return exp;
}

function buildLogarithms(exp: Uint8Array): Uint8Array {
  const log = new Uint8Array(256);
  for (let power = 0; power < ORDER; power += 1) {
    const value = exp[power];
    if (value === undefined) throw new Error('gf256: exponent table is short');
    log[value] = power;
  }
  return log;
}

const EXP = buildExponents();
const LOG = buildLogarithms(EXP);

function expAt(power: number): number {
  const value = EXP[power];
  if (value === undefined) throw new Error('gf256: exponent out of range');
  return value;
}

function logAt(value: number): number {
  const power = LOG[value];
  if (power === undefined) throw new Error('gf256: logarithm out of range');
  return power;
}

/** Addition and subtraction are the same operation in a field of characteristic two. */
export function gfAdd(a: number, b: number): number {
  return a ^ b;
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return expAt(logAt(a) + logAt(b));
}

export function gfInverse(a: number): number {
  if (a === 0) throw new Error('gf256: zero has no inverse');
  return expAt(ORDER - logAt(a));
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('gf256: division by zero');
  if (a === 0) return 0;
  return expAt(logAt(a) + ORDER - logAt(b));
}

/** `2^power`, the element the QR generator polynomial is built from. */
export function gfExp(power: number): number {
  return expAt(((power % ORDER) + ORDER) % ORDER);
}

// Polynomials are coefficient arrays indexed by degree, so poly[0] is the
// constant term. Codewords arrive highest degree first and are reversed once,
// at the boundary, rather than every routine here carrying two conventions.

/** Evaluates a polynomial at `x`, by Horner's rule from the highest degree down. */
export function polyEval(poly: readonly number[], x: number): number {
  let result = 0;
  for (let degree = poly.length - 1; degree >= 0; degree -= 1) {
    const coefficient = poly[degree];
    if (coefficient === undefined) throw new Error('gf256: polynomial has a hole');
    result = gfAdd(gfMul(result, x), coefficient);
  }
  return result;
}

export function polyMul(a: readonly number[], b: readonly number[]): number[] {
  if (a.length === 0 || b.length === 0) return [];
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (const [i, left] of a.entries()) {
    if (left === 0) continue;
    for (const [j, right] of b.entries()) {
      const at = i + j;
      const previous = out[at];
      if (previous === undefined) throw new Error('gf256: product has a hole');
      out[at] = gfAdd(previous, gfMul(left, right));
    }
  }
  return out;
}

export function polyAdd(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(Math.max(a.length, b.length)).fill(0);
  for (const [i, value] of a.entries()) out[i] = value;
  for (const [i, value] of b.entries()) {
    const previous = out[i];
    if (previous === undefined) throw new Error('gf256: sum has a hole');
    out[i] = gfAdd(previous, value);
  }
  return out;
}

/** Drops trailing zero coefficients so that `length - 1` is the real degree. */
export function polyTrim(poly: readonly number[]): number[] {
  const out = [...poly];
  while (out.length > 0 && out.at(-1) === 0) out.pop();
  return out;
}

/** Formal derivative. In characteristic two every even degree term vanishes. */
export function polyDerivative(poly: readonly number[]): number[] {
  const out: number[] = [];
  for (let degree = 1; degree < poly.length; degree += 1) {
    const coefficient = poly[degree];
    if (coefficient === undefined) throw new Error('gf256: polynomial has a hole');
    out.push(degree % 2 === 1 ? coefficient : 0);
  }
  return out;
}
