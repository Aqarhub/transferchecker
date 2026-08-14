// Symbol sets in the printed code.
//
// A set that came from a preset travels as one number, and the symbols are
// rebuilt from it. Anything the teacher typed by hand travels as text, which is
// the honest cost: a custom alphabet makes the printed code larger.

import { arabicSymbols, digitSymbols, latinSymbols, trueFalseSymbols } from '../alphabet';

/** Set ids are part of the printed artifact and may never be renumbered. */
const PRESETS: readonly ((count: number) => readonly string[])[] = [
  (count) => digitSymbols().slice(0, count),
  (count) => latinSymbols(count),
  (count) => arabicSymbols(count),
  () => trueFalseSymbols(),
];

export const CUSTOM_SET = 15;

const sameSymbols = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((symbol, index) => symbol === b[index]);

/** The preset that reproduces these symbols exactly, or CUSTOM_SET. */
export function symbolSetId(symbols: readonly string[]): number {
  const found = PRESETS.findIndex((preset) => sameSymbols(preset(symbols.length), symbols));
  return found < 0 ? CUSTOM_SET : found;
}

/** Rebuilds a preset's symbols, or null when the id is not a known preset. */
export function symbolsOfSet(setId: number, count: number): readonly string[] | null {
  const preset = PRESETS[setId];
  if (preset === undefined) return null;
  const symbols = preset(count);
  return symbols.length === count ? symbols : null;
}
