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
// `source` is the honest half, and it says who the copy came from rather than
// whether it is good enough. Both values ship. A boolean called `reviewed` was
// the wrong shape: it invited a yes that meant several different things, and the
// only useful question a build can answer here is where a sentence came from.

export type CopySource = 'owner' | 'editorial';

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
  /**
   * Where this language's copy came from.
   *
   * `owner`: written by the product owner in that language. Arabic and English.
   * Never regenerated, never machine translated, and DISCOVERABILITY section 6
   * forbids doing so to the Arabic in particular, because a page whose Arabic
   * reads like a translation contradicts the product's central claim before a
   * single feature is read.
   *
   * `editorial`: written for this repository against a researched rule set for
   * that language, then read again by a second pass whose brief was to find what
   * was still wrong, then checked across all eight for parallelism and
   * terminology. Publishable. A paid native review before a paid campaign in
   * that market is still worth buying, and that is a marketing decision rather
   * than a release gate.
   */
  readonly source: CopySource;
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
  { code: 'ar', dir: 'rtl', name: 'العربية', source: 'owner' },
  { code: 'en', dir: 'ltr', name: 'English', source: 'owner' },
  { code: 'de', dir: 'ltr', name: 'Deutsch', source: 'editorial' },
  { code: 'es', dir: 'ltr', name: 'Español', source: 'editorial' },
  { code: 'fr', dir: 'ltr', name: 'Français', source: 'editorial' },
  { code: 'hi', dir: 'ltr', name: 'हिन्दी', source: 'editorial' },
  { code: 'tr', dir: 'ltr', name: 'Türkçe', source: 'editorial' },
  { code: 'zh', dir: 'ltr', name: '中文', source: 'editorial' },
] as const satisfies readonly LocaleInfo[];

export type Locale = (typeof LOCALE_INFO)[number]['code'];

/** Just the codes, in registry order, which is what most callers want. */
export const LOCALES: readonly Locale[] = LOCALE_INFO.map((entry) => entry.code);

/** Arabic is the default, so a visitor with no match lands there. */
export const DEFAULT_LOCALE: Locale = 'ar';

export function localeOf(code: Locale): LocaleInfo {
  return LOCALE_INFO.find((entry) => entry.code === code) ?? LOCALE_INFO[0];
}

/**
 * The two the owner wrote, which no tool in this repository may rewrite.
 *
 * Named as a list rather than left implicit because it is a rule with teeth: a
 * future "regenerate all the copy" is a script somebody writes once, and this is
 * what it has to read before it runs.
 */
export const OWNER_WRITTEN: readonly Locale[] = LOCALE_INFO.filter(
  (entry) => entry.source === 'owner',
).map((entry) => entry.code);
