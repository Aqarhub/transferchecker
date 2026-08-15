// The locale layer, built so that adding a language changes no layout.
//
// The requirement is stronger than "translate the strings": switching language
// must not move a column, break a grid or change which screen you are on. Three
// decisions carry that, and each one is tested rather than intended.
//
// ONE DOM FOR EVERY LANGUAGE. A screen renders the same elements in the same
// order in every locale. Only the text, the `dir` and `--font-ui` differ, so a
// layout that works in one language cannot be broken in another by a branch
// that only one of them takes. `test/locale.test.ts` compares the structure.
//
// THE SAME PATH IN EVERY LANGUAGE. `/ar/exams/` and `/en/exams/` are the same
// screen, so the language switch keeps you where you were instead of returning
// you to a home page. A switcher that loses your place is the single most cited
// complaint about bilingual products.
//
// AND LAYOUT IS DIRECTION AGNOSTIC. Logical properties throughout, never
// `left`/`right`. The whole stylesheet is one file for both directions, because
// a second RTL stylesheet is the copy that rots.
//
// What is NOT mirrored, and this is where most RTL work goes wrong: numbers,
// identifiers, answer strings, and the answer SHEET itself. Arabic reads right
// to left; a number does not, and paper has a physical left edge where the
// timing strip is printed.

export type Direction = 'rtl' | 'ltr';

export interface LocaleInfo {
  readonly code: string;
  readonly dir: Direction;
  /** Which token stack the document sets `--font-ui` from. */
  readonly font: 'ar' | 'latin' | 'hi' | 'zh';
  /** Arabic needs more leading than Latin at the same size. */
  readonly lineHeight: number;
  readonly name: string;
}

/**
 * The languages the design system's font stack already covers.
 *
 * Listed in full even though only two ship today, because the registry is what
 * makes a third language a content task rather than a layout task. A locale
 * with no copy is simply not built; nothing else in the product changes.
 */
export const LOCALES: readonly LocaleInfo[] = [
  { code: 'ar', dir: 'rtl', font: 'ar', lineHeight: 1.75, name: 'العربية' },
  { code: 'en', dir: 'ltr', font: 'latin', lineHeight: 1.5, name: 'English' },
  { code: 'fr', dir: 'ltr', font: 'latin', lineHeight: 1.5, name: 'Français' },
  { code: 'de', dir: 'ltr', font: 'latin', lineHeight: 1.5, name: 'Deutsch' },
  { code: 'es', dir: 'ltr', font: 'latin', lineHeight: 1.5, name: 'Español' },
  { code: 'tr', dir: 'ltr', font: 'latin', lineHeight: 1.5, name: 'Türkçe' },
  { code: 'hi', dir: 'ltr', font: 'hi', lineHeight: 1.7, name: 'हिन्दी' },
  { code: 'zh', dir: 'ltr', font: 'zh', lineHeight: 1.6, name: '中文' },
];

export function localeOf(code: string): LocaleInfo {
  return LOCALES.find((entry) => entry.code === code) ?? { ...FALLBACK };
}

const FALLBACK: LocaleInfo = {
  code: 'ar',
  dir: 'rtl',
  font: 'ar',
  lineHeight: 1.75,
  name: 'العربية',
};

/**
 * A run of text that must never be reordered by the paragraph direction.
 *
 * A student identifier, a mark, a score and an answer string are read left to
 * right in every language on earth. Dropped into Arabic prose without this,
 * the bidirectional algorithm reorders `00713 / 45` into something that is not
 * the number anybody typed, and it does it silently.
 */
export function ltr(text: string): string {
  return `<bdi dir="ltr" class="num">${text}</bdi>`;
}

/**
 * A pseudo locale, for tests only.
 *
 * German compounds and Turkish suffixes make strings around 35 percent longer
 * than English, and a layout is only known to survive that if something has
 * actually tried it. This expands every string and brackets it, so a test can
 * assert that nothing clips, wraps wrongly or changes the structure. It is
 * never built into a shipped page.
 */
export function pseudo(text: string): string {
  if (text === '') return '';
  const stretched = text.replaceAll(/[aeiouAEIOU]/g, (vowel) => `${vowel}${vowel}`);
  return `[${stretched}${stretched.length < 12 ? '    ' : ''}]`;
}
