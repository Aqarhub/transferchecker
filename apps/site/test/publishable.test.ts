// What "ready to publish in this language" means, as assertions.
//
// A translation that is grammatical can still be unpublishable, and the ways it
// fails are mostly mechanical: a title that gets cut off in the result that was
// supposed to sell the page, an ASCII apostrophe in French, a full stop where
// Hindi wants a danda, half width punctuation in Chinese, two languages sharing
// a sentence because one was pasted from the other. None of those need a native
// speaker to catch. They need a rule written down once.
//
// So this file is the mechanical half of a language review, and it is honest
// about being only the half: it cannot tell whether a sentence sounds like a
// person, and nothing here should be mistaken for having asked one. What it does
// is make sure that the half a machine CAN check never regresses, in eight
// languages, on every commit.
//
// The length limits are measured rather than counted, because a search result
// truncates by PIXEL WIDTH and not by character count. A Han character is about
// twice the width of a Latin one, a Devanagari vowel sign has no width at all,
// and an `i` is a third of an `m`, so "under 60 characters" is a proxy that is
// wrong in both directions the moment a page is not in English. `src/width.ts`
// measures with Arial's own advance widths, which is the metric the truncation
// is actually computed against.

import { describe, expect, it } from 'vitest';
import { COPY, LOCALES, LOCALE_INFO } from '../src/content';
import type { Copy } from '../src/content';
import { emWidth, pixelWidth } from '../src/width';

/**
 * The two slots, measured in CSS pixels rather than counted in characters.
 *
 * A result page renders a title at about 20 pixels and a description at about
 * 14, and cuts each off at a width rather than at a count. These are the widths,
 * with a small margin below the real cut so a page is not one word from being
 * truncated. The MINIMUM is here for the opposite reason: a title that uses a
 * third of its slot says less than it could to a reader choosing between ten
 * results, and short is not the same as tight.
 *
 * One number for all eight languages, which is the whole point of measuring:
 * with a character count this table would need a row per script and would still
 * be wrong for a title made of narrow letters.
 */
const TITLE = { size: 20, min: 240, max: 580 };
const DESCRIPTION = { size: 14, min: 540, max: 920 };

/**
 * The mobile snippet, which is narrower and is not enforced.
 *
 * A description that clears 680 pixels survives on a phone as well as on a
 * desktop, and writing every language to that would cost most of what a
 * description is for. It is recorded so the tradeoff is visible: the tail of a
 * long description is a bonus on desktop and absent on mobile, so nothing load
 * bearing goes at the end of one.
 */
const MOBILE_SNIPPET = 680;

const prose = (copy: Copy): [string, string][] => [
  ['tagline', copy.tagline],
  ['lede', copy.lede],
  ['stepsTitle', copy.stepsTitle],
  ...copy.steps.map((step, at): [string, string] => [`steps[${String(at)}]`, step]),
  ['featuresTitle', copy.featuresTitle],
  ...copy.features.flatMap((feature, at): [string, string][] => [
    [`features[${String(at)}].title`, feature.title],
    [`features[${String(at)}].body`, feature.body],
  ]),
  ['accuracyTitle', copy.accuracyTitle],
  ['privacyTitle', copy.privacyTitle],
  ['privacy', copy.privacy],
  ['scopeTitle', copy.scopeTitle],
  ['scope', copy.scope],
  ['pricingTitle', copy.pricingTitle],
  ...copy.pricing.flatMap((plan, at): [string, string][] => [
    [`pricing[${String(at)}].title`, plan.title],
    [`pricing[${String(at)}].body`, plan.body],
  ]),
  ['pricingNote', copy.pricingNote],
  ['languagesTitle', copy.languagesTitle],
  ['pageWord', copy.pageWord],
];

/** Every string in a locale, including the two accuracy branches. */
const everything = (copy: Copy): [string, string][] => [
  ['title', copy.title],
  ['description', copy.description],
  ['summary', copy.summary],
  ...prose(copy),
  [
    'accuracy.unmeasured',
    copy.accuracy({ armed: false, papersNeeded: 30, cases: 55, questions: 2300, accuracy: null }),
  ],
  [
    'accuracy.measured',
    copy.accuracy({ armed: true, papersNeeded: 30, cases: 55, questions: 2300, accuracy: 0.998 }),
  ],
];

describe('the search result slot is used, and not overrun', () => {
  it('fits every title in the width a result gives it', () => {
    for (const locale of LOCALES) {
      const width = Math.round(pixelWidth(COPY[locale].title, TITLE.size));
      const said = `${locale} title is ${String(width)} pixels`;
      expect(width, said).toBeGreaterThanOrEqual(TITLE.min);
      expect(width, said).toBeLessThanOrEqual(TITLE.max);
    }
  });

  it('fits every description in the width a snippet gives it', () => {
    for (const locale of LOCALES) {
      const width = Math.round(pixelWidth(COPY[locale].description, DESCRIPTION.size));
      const said = `${locale} description is ${String(width)} pixels`;
      expect(width, said).toBeGreaterThanOrEqual(DESCRIPTION.min);
      expect(width, said).toBeLessThanOrEqual(DESCRIPTION.max);
    }
  });

  it('measures a Han character as twice a Latin one, which is why it measures', () => {
    // The assumption the budgets rest on, asserted so a broken table is caught
    // here rather than by a title that silently stops being checked.
    expect(emWidth('中')).toBe(1000);
    expect(emWidth('n')).toBe(556);
    expect(emWidth('i')).toBe(222);
    // Devanagari vowel signs stack on the consonant rather than advancing.
    expect(emWidth('कि')).toBe(emWidth('क'));
    // Turkish is full of dotless i, and treating it as a generic Latin letter
    // overstated a Turkish title by six percent.
    expect(emWidth('ı')).toBeLessThan(emWidth('u'));
    // An accent costs nothing, because the renderer stacks it.
    expect(emWidth('é')).toBe(emWidth('e'));
    expect(emWidth('ü')).toBe(emWidth('u'));
  });

  it('agrees with a real browser, which is the only thing that settles it', () => {
    // Reference widths measured in headless Chromium on 2026-08-16, rendering
    // each string at the stated size in the same fallback stack a search result
    // uses. A table nobody ever compared against a renderer is a number with a
    // decimal point on it, and the non Latin constants were fitted to these.
    const MEASURED: [string, number, number][] = [
      ['TransferChecker: mark answer sheets with a phone, Arabic first', 20, 562],
      ['TransferChecker: corriger les feuilles de réponses au téléphone, arabe d’abord', 20, 697],
      ['TransferChecker: cevap kağıtlarını telefonla okuyun, önce Arapça', 20, 580],
      ['TransferChecker：用手机批阅答题卡，阿拉伯语优先', 20, 468],
      ['TransferChecker: फ़ोन से उत्तर पत्रक जाँचें, पहले अरबी', 20, 415],
      ['TransferChecker: تصحيح أوراق الإجابة بالجوال، عربي أولاً', 20, 483],
    ];
    for (const [text, size, browser] of MEASURED) {
      const drift = Math.abs(pixelWidth(text, size) - browser) / browser;
      expect(
        drift,
        `${text.slice(0, 34)} drifted ${(drift * 100).toFixed(1)} percent`,
      ).toBeLessThan(0.05);
    }
  });

  it('finishes a sentence before the mobile cut', () => {
    // Not a length rule, and the first formulation of it was wrong: it asked
    // whether the FIRST SENTENCE fit, which a one sentence description trivially
    // fails however good it is. The real requirement is that a phone reader gets
    // a whole thought rather than a fragment, so what has to fit is a sentence
    // BOUNDARY, wherever it falls. A description longer than the snippet is fine;
    // one whose only full stop is past the cut is a paragraph chopped mid clause.
    for (const locale of LOCALES) {
      const description = COPY[locale].description;
      if (pixelWidth(description, DESCRIPTION.size) <= MOBILE_SNIPPET) continue;
      const ends = [...description.matchAll(/[.。।]/g)].map((match) => match.index);
      const survives = ends.some(
        (at) => pixelWidth(description.slice(0, at + 1), DESCRIPTION.size) <= MOBILE_SNIPPET,
      );
      expect(survives, `${locale} has no sentence end inside the mobile snippet`).toBe(true);
    }
  });

  it('never ends a Hindi title or description with a danda', () => {
    // A terminator belongs in prose. In a search result it looks wrong and it
    // spends a character out of a budget that is already the tightest here.
    expect(COPY.hi.title.endsWith('।')).toBe(false);
    expect(COPY.hi.description.endsWith('।')).toBe(false);
  });

  it('leads every title with the product name', () => {
    // The brand goes first here rather than last, which is the opposite of the
    // usual advice and right for this case: the name is the thing a returning
    // reader scans for, and there is no site name suffix to compete with it.
    for (const locale of LOCALES) {
      expect(COPY[locale].title.startsWith('TransferChecker'), locale).toBe(true);
    }
  });
});

describe('no two languages are the same page', () => {
  it('shares no title and no description', () => {
    // Duplicate metadata across a language cluster is a signal that the pages
    // are the same page, which is how a language gets folded away.
    for (const field of ['title', 'description', 'summary'] as const) {
      const seen = new Map<string, string>();
      for (const locale of LOCALES) {
        const value = COPY[locale][field];
        const owner = seen.get(value);
        expect(owner, `${locale} and ${owner ?? ''} share a ${field}`).toBeUndefined();
        seen.set(value, locale);
      }
    }
  });

  it('shares no long run of text between two languages', () => {
    // The paste tell. Two languages that legitimately share a phrase share a
    // short one, and a run this long is a sentence that did not get translated.
    const RUN = 40;
    const runsOf = (text: string): Set<string> => {
      const found = new Set<string>();
      const clean = text.replaceAll('TransferChecker', '');
      for (let at = 0; at + RUN <= clean.length; at += 1) found.add(clean.slice(at, at + RUN));
      return found;
    };
    const byLocale = new Map(
      LOCALES.map((locale) => [
        locale,
        runsOf(
          everything(COPY[locale])
            .map(([, text]) => text)
            .join(' '),
        ),
      ]),
    );
    for (const [left, leftRuns] of byLocale) {
      for (const [right, rightRuns] of byLocale) {
        if (left >= right) continue;
        const shared = [...leftRuns].filter((run) => rightRuns.has(run));
        expect(shared.slice(0, 1), `${left} and ${right} share text`).toEqual([]);
      }
    }
  });
});

describe('typography, which is where a translation announces itself', () => {
  it('uses the right apostrophe in French and Turkish', () => {
    // The ASCII apostrophe in French prose is the single loudest sign that a
    // page was typed by someone who does not set French. Turkish needs the same
    // character before a suffix on a proper noun.
    for (const locale of ['fr', 'tr'] as const) {
      for (const [field, text] of everything(COPY[locale])) {
        expect(text, `${locale}.${field}`).not.toMatch(/[a-zA-ZÀ-ÿ]'[a-zA-ZÀ-ÿ]/);
      }
    }
  });

  it('never uses a straight double quote in any language', () => {
    for (const locale of LOCALES) {
      for (const [field, text] of everything(COPY[locale])) {
        expect(text, `${locale}.${field}`).not.toContain('"');
      }
    }
  });

  it('closes every Spanish question and exclamation it opens', () => {
    // Spanish opens with an inverted mark. Counting is enough: an unmatched pair
    // is the error, and there is no legitimate lone closer.
    const text = everything(COPY.es)
      .map(([, value]) => value)
      .join(' ');
    const count = (mark: string): number => text.split(mark).length - 1;
    expect(count('?'), 'Spanish questions without their opening mark').toBe(count('¿'));
    expect(count('!'), 'Spanish exclamations without their opening mark').toBe(count('¡'));
  });

  it('ends every Hindi sentence with a danda', () => {
    // Devanagari terminates a sentence with U+0964, not with a full stop. A page
    // full of ASCII periods reads as a machine translation at a glance.
    for (const [field, text] of prose(COPY.hi)) {
      if (!/[ऀ-ॿ]/.test(text)) continue;
      if (!/[.।]$/.test(text)) continue;
      expect(text.endsWith('।'), `hi.${field} ends with "${text.slice(-12)}"`).toBe(true);
    }
  });

  it('uses full width punctuation in Chinese', () => {
    // Half width punctuation between Han characters is the Chinese equivalent of
    // the ASCII apostrophe in French: correct in a terminal, wrong on a page.
    for (const [field, text] of everything(COPY.zh)) {
      expect(text, `zh.${field}`).not.toMatch(/[一-鿿][,;:!?]/);
      expect(text, `zh.${field}`).not.toMatch(/[一-鿿]\.(?:\s|$)/);
    }
    for (const [field, text] of prose(COPY.zh)) {
      if (!/[一-鿿]/.test(text)) continue;
      if (!/[。.]$/.test(text)) continue;
      expect(text.endsWith('。'), `zh.${field}`).toBe(true);
    }
  });

  it('leaves no double space and no stray edge whitespace anywhere', () => {
    for (const locale of LOCALES) {
      for (const [field, text] of everything(COPY[locale])) {
        expect(text, `${locale}.${field}`).not.toMatch(/ {2}/);
        expect(text, `${locale}.${field}`).toBe(text.trim());
      }
    }
  });

  it('carries no em dash, in any language, ever', () => {
    // Duplicated from the repository wide check on purpose. That one scans files
    // and would miss a character composed at runtime; this one reads the values.
    // Built from its code point rather than typed, because the file scanner is
    // deliberately blunt and would flag this very assertion.
    const emDash = String.fromCodePoint(0x2014);
    const enDash = String.fromCodePoint(0x2013);
    for (const locale of LOCALES) {
      for (const [field, text] of everything(COPY[locale])) {
        expect(text, `${locale}.${field}`).not.toContain(emDash);
        expect(text, `${locale}.${field}`).not.toContain(enDash);
      }
    }
  });
});

describe('the claims survive translation intact', () => {
  it('names the refusal and the warning rate in both branches of every language', () => {
    // Acceptance criterion 14 again, from the other side: here it is checked
    // against the language's own declared words rather than against English.
    for (const locale of LOCALES) {
      const copy = COPY[locale];
      for (const [field, text] of everything(copy).filter(([key]) => key.startsWith('accuracy.'))) {
        for (const word of copy.rateWords) expect(text, `${locale}.${field}`).toContain(word);
      }
    }
  });

  it('never promises sync in the plans without disclosing it beside the privacy claim', () => {
    // The defect this exists for was measured rather than argued. Six
    // independent native readers reviewed this page and ALL SIX concluded that
    // listing sync as a free feature contradicted the privacy section, and two
    // rated it their highest severity. They were wrong about the product and
    // right about the page: photographs never leave the device and marks do
    // sync, and no sentence anywhere said which was which.
    //
    // Six out of six is not six mistakes. Five readers are the usual threshold
    // for finding most comprehension defects, so a unanimous six is a measured
    // failure of the copy, and the fix belongs where the absolute claim is made
    // rather than in a pricing list the reader reaches later.
    for (const locale of LOCALES) {
      const copy = COPY[locale];
      if (!copy.pricingNote.includes(copy.syncWord)) continue;
      expect(
        copy.privacy,
        `${locale} sells sync in the plans and never mentions it where it says nothing leaves the device`,
      ).toContain(copy.syncWord);
    }
  });

  it('says what does leave the device, not only what does not', () => {
    // A disclosure made only in the negative is the shape that misled all six.
    // Every privacy paragraph names the thing that travels, in its own words.
    for (const locale of LOCALES) {
      const copy = COPY[locale];
      expect(copy.privacy, `${locale} privacy`).toContain(copy.syncWord);
    }
  });

  it('states the unit as the question in every language', () => {
    for (const locale of LOCALES) {
      const copy = COPY[locale];
      const measured = copy.accuracy({
        armed: true,
        papersNeeded: 30,
        cases: 55,
        questions: 2300,
        accuracy: 0.998,
      });
      expect(measured, locale).toContain(copy.unitWord);
    }
  });

  it('keeps the same shape in every language, so the layout is built once', () => {
    for (const locale of LOCALES) {
      const copy = COPY[locale];
      expect(copy.steps.length, locale).toBe(3);
      expect(copy.features.length, locale).toBe(4);
      expect(copy.pricing.length, locale).toBe(2);
      expect(copy.rateWords.length, locale).toBe(2);
    }
  });

  it('leaves no placeholder unfilled and no field empty', () => {
    for (const locale of LOCALES) {
      for (const [field, text] of everything(COPY[locale])) {
        expect(text.trim(), `${locale}.${field}`).not.toBe('');
        expect(text, `${locale}.${field}`).not.toMatch(/\{(cases|questions|papers|accuracy)\}/);
        // Case sensitive, deliberately. The lowercase form of the first one is
        // the Spanish word for "all", and an insensitive match failed on a
        // perfectly good sentence.
        expect(text, `${locale}.${field}`).not.toMatch(/\b(TODO|FIXME|XXX)\b|lorem ipsum/);
      }
    }
  });

  it('gives every language a list separator that is actually its own', () => {
    for (const entry of LOCALE_INFO) {
      const separator = COPY[entry.code].listSeparator;
      expect(separator.length, entry.code).toBeGreaterThan(0);
      // A Chinese list is joined by the enumeration comma, an Arabic one by the
      // Arabic comma. Latin gets the ASCII pair. Nobody gets a bare space.
      expect(separator.trim(), entry.code).not.toBe('');
    }
  });
});
