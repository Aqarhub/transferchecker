// Every file a crawler comes and fetches, in every language, checked as a set.
//
// The requirement this file exists for is not "an llms.txt exists". It is that
// the crawler facing surface and the site cannot disagree, which is
// DISCOVERABILITY section 8's one condition on publishing llms.txt at all:
// generate it from the same source as the sitemap so it cannot go stale.
//
// So the assertions here are relational rather than textual. Every URL named in
// any crawler file must be a file this build actually writes. Every language in
// the registry must appear in every one of them. And adding a language must not
// require touching any of them, which is checked by comparing the set of
// languages each file names against the registry rather than against a list
// written here: a list written here is the second source that rots.
//
// The 404 this prevents is the expensive one. Section 6 rule 1: an hreflang
// cluster that names a page which does not exist makes Google drop the WHOLE
// cluster, not the missing member, so a language advertised before it is built
// costs the seven that were built.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFiles } from '../src/build';
import { COPY, LOCALES, LOCALE_INFO, OWNER_WRITTEN, SITE } from '../src/content';
import { indexNowFile } from '../src/indexnow';
import { REGIME_LAW, audienceOf, regimeOf, slugOf } from '@transferchecker/account';
import type { Evidence } from '../src/evidence';

const UNMEASURED: Evidence = {
  armed: false,
  papersNeeded: 30,
  cases: 55,
  questions: 2300,
  accuracy: null,
};

const files = (key?: string): Map<string, string> =>
  new Map(buildFiles(UNMEASURED, key).map((file) => [file.path, file.text]));

/** Every absolute URL on our own host that any generated file points at. */
function ourLinks(text: string): string[] {
  return [...text.matchAll(new RegExp(`${SITE}(/[^\\s)"'<]*)`, 'g'))].map(
    (match) => match[1] ?? '',
  );
}

/** A URL as the build names it: a folder is that folder's index.html. */
const asPath = (url: string): string => {
  const bare = url.split('#')[0] ?? '';
  return (bare.endsWith('/') ? `${bare}index.html` : bare).replace(/^\//, '');
};

/**
 * The one percentage on this site that is not a claim about us.
 *
 * "Print at 100 percent" is an instruction to a printer and it is load bearing:
 * a page shrunk by "fit to page" prints bubbles the scanner then measures in the
 * wrong millimetres. Exempted by exact text, and in exactly the two languages
 * that say it that way, so a future "100% accurate" cannot use the same hole.
 */
const PRINT_INSTRUCTION = ['100٪', '100 percent'];

describe('the crawler files are generated, not maintained', () => {
  it('writes llms.txt and llms-full.txt for every language in the registry', () => {
    const built = files();
    for (const locale of LOCALES) {
      expect(built.has(`${locale}/llms.txt`), locale).toBe(true);
      expect(built.has(`${locale}/llms-full.txt`), locale).toBe(true);
    }
    expect(built.has('llms.txt')).toBe(true);
  });

  it('names every language in the index, the sitemap and each llms.txt alike', () => {
    // The set comparison is the point. Any file that knows about seven of eight
    // languages fails here, whichever seven it knows.
    const built = files();
    const registry: ReadonlySet<string> = new Set<string>(LOCALES);
    const named = (text: string): Set<string> =>
      new Set(
        ourLinks(text)
          .map((url) => url.split('/')[1] ?? '')
          .filter((code) => registry.has(code)),
      );

    expect(named(built.get('llms.txt') ?? '')).toEqual(registry);
    expect(named(built.get('sitemap.xml') ?? '')).toEqual(registry);
    for (const locale of LOCALES) {
      expect(named(built.get(`${locale}/llms.txt`) ?? ''), locale).toEqual(registry);
      expect(named(built.get(`${locale}/llms-full.txt`) ?? ''), locale).toEqual(registry);
    }
  });

  it('points at nothing it did not build', () => {
    // The failure this catches is the one that costs a whole hreflang cluster:
    // a language named in the head or the sitemap whose page returns 404.
    const built = files();
    for (const [path, text] of built) {
      if (path.endsWith('.css')) continue;
      for (const url of ourLinks(text)) {
        const target = asPath(url);
        expect(built.has(target), `${path} points at ${url}`).toBe(true);
        // And the fragment too. A map whose entries land on the top of the page
        // is a map that quietly stopped working when a section was renamed.
        const fragment = url.split('#')[1];
        if (fragment !== undefined) {
          expect(built.get(target) ?? '', `${path} points at ${url}`).toContain(`id="${fragment}"`);
        }
      }
    }
  });

  it('lists every language on every page as an alternate, itself included', () => {
    const built = files();
    for (const locale of LOCALES) {
      const html = built.get(`${locale}/index.html`) ?? '';
      for (const candidate of LOCALES) {
        expect(html, `${locale} is missing ${candidate}`).toContain(
          `hreflang="${candidate}" href="${SITE}/${candidate}/"`,
        );
      }
    }
  });

  it('sets the right direction and the right language on every document', () => {
    const built = files();
    for (const entry of LOCALE_INFO) {
      expect(built.get(`${entry.code}/index.html`)).toContain(
        `<html lang="${entry.code}" dir="${entry.dir}">`,
      );
    }
  });
});

describe('llms.txt says what the page says, because it is made of it', () => {
  it('carries this language own summary and its section titles', () => {
    const built = files();
    for (const locale of LOCALES) {
      const short = built.get(`${locale}/llms.txt`) ?? '';
      const full = built.get(`${locale}/llms-full.txt`) ?? '';
      const copy = COPY[locale];
      for (const text of [short, full]) {
        expect(text, locale).toContain(copy.summary);
        expect(text, locale).toContain(copy.featuresTitle);
        expect(text, locale).toContain(copy.pricingTitle);
      }
      // The full file is the page, so nothing is left behind a link.
      for (const feature of copy.features) expect(full, locale).toContain(feature.body);
      for (const plan of copy.pricing) expect(full, locale).toContain(plan.body);
      expect(full, locale).toContain(copy.accuracy(UNMEASURED));
    }
  });

  it('claims no accuracy in any language while the gate is disarmed', () => {
    // The same gate the HTML is held to. An assistant quoting our llms.txt must
    // not be able to quote a number the page itself refuses to print.
    for (const [path, text] of files()) {
      if (!path.endsWith('.txt')) continue;
      const claims = [...text.matchAll(/\d+(?:\.\d+)?\s*(?:%|٪|percent)/g)]
        .map((match) => match[0])
        .filter((found) => !PRINT_INSTRUCTION.includes(found));
      expect(claims, path).toEqual([]);
    }
  });

  it('names each language in that language own name, never in English', () => {
    const built = files();
    for (const entry of LOCALE_INFO) {
      expect(built.get('llms.txt')).toContain(`[${entry.name}]`);
      for (const locale of LOCALES) {
        expect(built.get(`${locale}/llms.txt`), locale).toContain(`[${entry.name}]`);
      }
    }
  });
});

describe('IndexNow, whose key never lives in the repository', () => {
  it('writes no key file when no key was given', () => {
    expect([...files().keys()].filter((path) => /^[a-zA-Z0-9-]{8,}\.txt$/.test(path))).toEqual([]);
  });

  it('writes the key file named for the key and containing it', () => {
    const key = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    expect(files(key).get(`${key}.txt`)).toBe(key);
  });

  it('refuses a key the protocol would reject rather than writing a dead file', () => {
    // A key file the engine cannot parse fails silently and looks exactly like
    // one that works, so the shape is checked here instead of on their end.
    for (const bad of ['', 'short', 'has spaces in it', 'a'.repeat(129), 'key/with/slash']) {
      expect(indexNowFile(bad), bad).toBeNull();
    }
  });
});

describe('the two language registries cannot drift apart', () => {
  it('agrees with the design system about every code, name and direction', () => {
    // There are two registries in this repository and that is deliberate: the
    // marketing site has no workspace dependency, which is the decision that
    // kept a framework and its transitive tree out of it, and coupling it to the
    // design system package for eight strings would undo that for no reader.
    //
    // The cost of two lists is drift, so it is paid here instead. This reads the
    // design system's registry as TEXT and checks the two agree, which catches a
    // ninth language added to one and forgotten in the other, an endonym typed
    // differently, or a direction set wrong. It is the cheapest thing that makes
    // the duplication safe rather than merely tolerated.
    const other = readFileSync(
      new URL('../../../packages/ui/src/locale.ts', import.meta.url),
      'utf8',
    );
    for (const entry of LOCALE_INFO) {
      expect(other, `${entry.code} is missing from the design system registry`).toContain(
        `code: '${entry.code}'`,
      );
      expect(other, `${entry.code} has a different name there`).toContain(`name: '${entry.name}'`);
      expect(other, `${entry.code} has a different direction there`).toContain(
        `code: '${entry.code}', dir: '${entry.dir}'`,
      );
    }
    // And nothing there that is not here, which is the direction that would
    // otherwise advertise a language the site cannot serve.
    const theirs = [...other.matchAll(/\{ code: '([a-z-]+)'/g)].map((match) => match[1]);
    expect(new Set(theirs)).toEqual(new Set<string>(LOCALES));
  });
});

describe('every published language can carry a country in its URL', () => {
  it('accepts a legal path for each of the eight, in a real market', () => {
    // PLAN section 8ج: the country enters the URL where the content depends on
    // it, which is the legal pages. That only works if every language the site
    // publishes is one the account layer will accept in a slug, so a language
    // added here without being published there would produce a marketing page
    // with no policy behind it.
    //
    // The markets are the ones each language was actually written for, which is
    // also a check that the pair is one a person could really be: `zh` with a
    // Chinese country, `hi` with India, `ar` with the Gulf.
    const markets: Readonly<Record<string, string>> = {
      ar: 'AE',
      en: 'GB',
      de: 'DE',
      es: 'ES',
      fr: 'FR',
      hi: 'IN',
      tr: 'TR',
      zh: 'CN',
    };
    for (const locale of LOCALES) {
      const country = markets[locale];
      expect(country, `${locale} has no market named`).toBeDefined();
      if (country === undefined) continue;
      const slug = slugOf(country, locale);
      expect(audienceOf(slug, LOCALES), slug).toEqual({ country, language: locale });
      // And every one of those countries reaches a regime with a named law, so
      // no published language can land on a policy page with no statute on it.
      expect(REGIME_LAW[regimeOf(country)].length, country).toBeGreaterThan(20);
    }
  });
});

describe('where each language came from is recorded, not implied', () => {
  it('names the two the owner wrote, which nothing here may regenerate', () => {
    // The rule with teeth. A future "regenerate all the copy" is a script
    // somebody writes once, and DISCOVERABILITY section 6 forbids it touching
    // the Arabic: a page whose Arabic reads like a translation contradicts this
    // product's central claim before a single feature is read.
    expect(OWNER_WRITTEN).toEqual(['ar', 'en']);
    for (const entry of LOCALE_INFO) {
      expect(['owner', 'editorial'], entry.code).toContain(entry.source);
    }
  });
});
