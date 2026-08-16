// How wide a string renders, because that is what actually gets truncated.
//
// A search result cuts a title off by PIXEL WIDTH, not by character count. The
// familiar "keep it under 60 characters" is a proxy for about 600 pixels of
// Arial, and the proxy breaks in both directions the moment a page is not in
// English: "TransferChecker: mark answer sheets with a phone, Arabic first" is
// 62 narrow characters and fits comfortably, while 62 Han characters are more
// than twice the width and would be cut in half.
//
// So this measures instead of counting. The table is Arial's own advance widths
// in units of 1/1000 em, which is the metric the truncation is computed against,
// and every non Latin block gets one representative width rather than a full
// table.
//
// HOW ACCURATE IT ACTUALLY IS, because a budget check that has never been
// checked is a number with a decimal point on it. Every string on this site was
// rendered in headless Chromium and measured against this table: Latin and Han
// agree within 1 percent, Devanagari within 3.4, and Arabic within 3.6. The
// budgets in `test/publishable.test.ts` sit far enough below the real cut that a
// 4 percent error cannot flip the answer. The non Latin constants below were
// FITTED to that measurement rather than guessed at, and the fit is pinned by a
// test so the table cannot drift back.
//
// It is in `src` rather than in the test because it is a fact about the product
// surface, and a second copy of a width table is a second answer.

/** Arial advance widths, units per 1000 em, for the printable ASCII range. */
const ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/**
 * The few Latin letters that do not decompose to an ASCII base.
 *
 * Turkish is why this exists: the dotless i is a third of the width the generic
 * Latin estimate gave it, and a Turkish title is full of them. Measured against
 * Chromium, this one entry moved the Turkish error from 6 percent to under 1.
 */
const LATIN_EXTRA: Readonly<Record<string, number>> = {
  ı: 222,
  İ: 278,
  ł: 222,
  Ł: 556,
  ø: 556,
  Ø: 778,
  æ: 889,
  Æ: 1000,
  œ: 944,
  Œ: 1000,
  ß: 611,
  ð: 556,
  þ: 556,
};

/**
 * Representative widths for the scripts this product ships in.
 *
 * Han, Hiragana, Katakana and the full width forms are exactly one em by
 * definition of the block, which is the only entry here that is not an estimate.
 * The other two were fitted against Chromium rather than guessed: see
 * `test/publishable.test.ts` for what the fit is worth.
 */
function blockWidth(code: number): number {
  // Full width and CJK: one em, by definition of the block.
  if (code >= 0x1100 && code <= 0x115f) return 1000;
  if (code >= 0x2e80 && code <= 0xa4cf) return 1000;
  if (code >= 0xac00 && code <= 0xd7a3) return 1000;
  if (code >= 0xf900 && code <= 0xfaff) return 1000;
  if (code >= 0xfe30 && code <= 0xfe6f) return 1000;
  if (code >= 0xff00 && code <= 0xff60) return 1000;
  if (code >= 0xffe0 && code <= 0xffe6) return 1000;
  // Arabic. Narrower than Latin once shaped, and narrower still because the
  // joining forms of the common letters are the narrow ones.
  if (code >= 0x0600 && code <= 0x06ff) {
    // Harakat and the other combining marks sit above or below the letter.
    return code >= 0x064b && code <= 0x0655 ? 0 : 462;
  }
  if (code >= 0xfb50 && code <= 0xfeff) return 462;
  // Devanagari. Vowel signs and nuqta stack rather than advance.
  if (code >= 0x0900 && code <= 0x097f) {
    const combining = (code >= 0x093a && code <= 0x094f) || (code >= 0x0951 && code <= 0x0957);
    return combining ? 0 : 548;
  }
  // Greek and Cyrillic, close enough to lowercase Latin for a budget.
  if (code >= 0x0370 && code <= 0x04ff) return 556;
  // Punctuation and everything else Latin sized.
  return 500;
}

/** Width of one string, in thousandths of an em. */
export function emWidth(text: string): number {
  let total = 0;
  // Decomposing first turns every accented Latin letter into its base plus a
  // combining mark, so an `é` costs exactly what an `e` costs and the mark costs
  // nothing, which is what the renderer does with it.
  for (const character of text.normalize('NFD')) {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x20 && code <= 0x7e) {
      total += ASCII[code - 0x20] ?? 500;
      continue;
    }
    // Combining diacritics, which advance nothing.
    if (code >= 0x0300 && code <= 0x036f) continue;
    const extra = LATIN_EXTRA[character];
    total += extra ?? blockWidth(code);
  }
  return total;
}

/** Width in CSS pixels at a given font size, which is what a budget is set in. */
export function pixelWidth(text: string, fontSize: number): number {
  return (emWidth(text) * fontSize) / 1000;
}
