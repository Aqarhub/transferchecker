// Symbol sets printed inside or beside bubbles.
//
// A bubble always carries the symbol it represents, so the scanner never needs
// to know what kind of field it is looking at: it reads a group of bubbles and
// reports the symbol of the filled one.
//
// These are helpers, not constraints. A spec stores a plain list of symbols, so
// a teacher can type any set they like.

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * Latin letters with I and O removed, because they are read as 1 and 0 on a
 * shaded sheet. Long standing practice on printed answer forms.
 */
const LATIN = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'M',
  'N',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
] as const;

// Abjad ordering, the convention on Arabic exam papers.
const ARABIC = ['أ', 'ب', 'ج', 'د', 'ه', 'و', 'ز', 'ح', 'ط', 'ي'] as const;

/** Digits zero to nine, for identity and numeric grids. */
export function digitSymbols(): readonly string[] {
  return DIGITS;
}

/** The first `count` Latin choice letters. */
export function latinSymbols(count: number): readonly string[] {
  return LATIN.slice(0, count);
}

/** The first `count` Arabic choice letters. */
export function arabicSymbols(count: number): readonly string[] {
  return ARABIC.slice(0, count);
}

/** True and false, the other common two-symbol set. */
export function trueFalseSymbols(): readonly string[] {
  return ['T', 'F'];
}

/** Largest symbol count a single group may carry. */
export const MAX_SYMBOLS = 10;
