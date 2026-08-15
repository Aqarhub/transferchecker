// The language registry, and the single source every crawler file is generated
// from.
//
// DISCOVERABILITY section 8 settles llms.txt with one condition attached: we
// publish it because it costs half an hour and does no harm, and we GENERATE IT
// FROM THE SAME SOURCE AS THE SITEMAP SO IT CANNOT GO STALE. That condition is
// what this file is. robots.txt, the sitemap, every hreflang cluster, the
// JSON-LD, the root llms.txt and each language's own llms.txt all read this
// array and nothing else, so a language is added by adding one entry and its
// copy, and there is no second list anywhere that can fall out of step.
//
// WHY EVERY LOCALE HERE IS ALSO A REAL PAGE. Section 6 rule 1 is that hreflang
// must be reciprocal, and a cluster that names a language whose page returns 404
// is worse than a cluster that never named it: Google drops the whole set rather
// than the missing member. So this registry does not carry aspirations. A code
// is in here only when `content.ts` carries written copy for it, which the type
// system enforces, because `COPY` is a record over exactly these codes.
//
// `reviewed` is the honest half. Arabic and English were written by the owner.
// The other six were drafted here and are marked false until a native speaker of
// each has read them, and the flag is in the code rather than in a document so
// that the answer to "has anyone who speaks Turkish read the Turkish page" is
// something a build can be asked rather than something somebody remembers.

export interface LocaleInfo {
  readonly code: string;
  readonly dir: 'rtl' | 'ltr';
  /**
   * The language's own name for itself.
   *
   * A switcher that lists "Arabic" in English is asking a reader to recognise
   * their language in a language they do not read. The endonym never needs
   * translating, which is also why it is the same string in all eight pages.
   */
  readonly name: string;
  /** False until a native speaker has read the copy. Recorded, never hidden. */
  readonly reviewed: boolean;
}

/**
 * The eight languages, in the order they are shown.
 *
 * Arabic first because the product is Arabic first, English second because it is
 * the second language of every market in the list, then the rest alphabetically
 * by code so the order is a rule rather than a preference and nobody has to
 * argue about it when a ninth arrives.
 *
 * Note on codes: these are plain ISO 639-1 language codes with no region, and
 * deliberately. Section 6 rule 4 warns that `hreflang="sa"` is Sanskrit and the
 * Saudi form is `ar-SA`, and the warning is worth heeding, but the page it
 * describes is written for Arabic speakers rather than for one country. A
 * regionless code targets all of them; adding `ar-SA` alongside would be a
 * second entry pointing at the same URL, which is a moving part with no reader.
 */
export const LOCALE_INFO = [
  { code: 'ar', dir: 'rtl', name: 'العربية', reviewed: true },
  { code: 'en', dir: 'ltr', name: 'English', reviewed: true },
  { code: 'de', dir: 'ltr', name: 'Deutsch', reviewed: false },
  { code: 'es', dir: 'ltr', name: 'Español', reviewed: false },
  { code: 'fr', dir: 'ltr', name: 'Français', reviewed: false },
  { code: 'hi', dir: 'ltr', name: 'हिन्दी', reviewed: false },
  { code: 'tr', dir: 'ltr', name: 'Türkçe', reviewed: false },
  { code: 'zh', dir: 'ltr', name: '中文', reviewed: false },
] as const satisfies readonly LocaleInfo[];

export type Locale = (typeof LOCALE_INFO)[number]['code'];

/** Just the codes, in registry order, which is what most callers want. */
export const LOCALES: readonly Locale[] = LOCALE_INFO.map((entry) => entry.code);

/** Arabic is the default, so a visitor with no match lands there. */
export const DEFAULT_LOCALE: Locale = 'ar';

export function localeOf(code: Locale): LocaleInfo {
  return LOCALE_INFO.find((entry) => entry.code === code) ?? LOCALE_INFO[0];
}

/** The languages nobody who speaks them has read yet. A pre launch blocker. */
export const UNREVIEWED: readonly Locale[] = LOCALE_INFO.filter((entry) => !entry.reviewed).map(
  (entry) => entry.code,
);
