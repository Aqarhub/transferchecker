// The country list, the regimes, and the country-language slug.
//
// The assertions worth having here are the ones about the FAILURE modes, not
// about the happy path. A signup form that lists 248 countries is obviously
// working; what is not obvious is whether an unknown slug quietly serves
// somebody the wrong country's privacy policy, and that is the one defect in
// this area that matters, because it is a legal statement made to the wrong
// reader with no visible symptom.

import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  NOT_OFFERED,
  REGIME_LAW,
  audienceOf,
  countryName,
  regimeOf,
  slugOf,
} from '../src/countries';

/**
 * The languages the site publishes, restated rather than imported.
 *
 * A package must not import from an app, and this list is here only to prove
 * that a country name resolves in each of them. The site owns the real registry
 * and `apps/site/test/crawlers.test.ts` holds the two in step.
 */
const LOCALES = ['ar', 'en', 'de', 'es', 'fr', 'hi', 'tr', 'zh'];

describe('the list is a standard, not a preference', () => {
  it('offers every officially assigned country except the ones named', () => {
    // 249 is the count of ISO 3166-1 officially assigned alpha-2 codes.
    expect(COUNTRIES.length).toBe(249 - NOT_OFFERED.length);
    expect(new Set(COUNTRIES).size, 'a duplicate country').toBe(COUNTRIES.length);
    for (const code of COUNTRIES) expect(code, code).toMatch(/^[A-Z]{2}$/);
  });

  it('records what is not offered, with its reason, rather than dropping it silently', () => {
    // The omission is a commercial decision by the product owner. It is data
    // with a reason attached so that "why is this country missing" has an answer
    // in the file that omits it.
    expect(NOT_OFFERED.map((entry) => entry.code)).toEqual(['IL']);
    for (const entry of NOT_OFFERED) {
      expect(entry.reason.length, entry.code).toBeGreaterThan(20);
      expect(COUNTRIES).not.toContain(entry.code);
    }
  });

  it('carries no withdrawn code, which ICU still answers for', () => {
    // Soviet Union, Yugoslavia, Zaire, Netherlands Antilles and the rest are
    // still in CLDR because old data references them. None is a country a
    // teacher can be in.
    for (const gone of ['SU', 'YU', 'ZR', 'AN', 'CS', 'DD', 'TP', 'UK', 'BU']) {
      expect(COUNTRIES, gone).not.toContain(gone);
    }
    // And the groupings that are not countries at all.
    for (const group of ['EU', 'UN', 'QO', 'ZZ']) expect(COUNTRIES, group).not.toContain(group);
  });
});

describe('the names come from the platform, in the reader own language', () => {
  it('names every country in all eight languages without a gap', () => {
    for (const locale of LOCALES) {
      for (const country of COUNTRIES) {
        const name = countryName(country, locale);
        expect(name, `${country} in ${locale}`).not.toBe(country);
        expect(name.trim(), `${country} in ${locale}`).not.toBe('');
      }
    }
  });

  it('gives a different name in a different language, which is the whole point', () => {
    expect(countryName('AE', 'ar')).not.toBe(countryName('AE', 'en'));
    expect(countryName('SA', 'zh')).not.toBe(countryName('SA', 'en'));
    // And it tracks renames: Türkiye, not Turkey, which is why this is not a
    // hand written table.
    expect(countryName('TR', 'en')).toContain('rkiye');
  });
});

describe('the regime decides which law a policy is written against', () => {
  it('maps every country to a regime that has a law behind it', () => {
    for (const country of COUNTRIES) {
      const regime = regimeOf(country);
      expect(REGIME_LAW[regime], country).toBeDefined();
      expect(REGIME_LAW[regime].length, country).toBeGreaterThan(20);
    }
  });

  it('puts the markets we publish a language for under their own law', () => {
    // Each of these has its own statute and its own supervisory authority, so a
    // single policy naming one of them would name the wrong one to the rest.
    expect(regimeOf('SA')).toBe('sa');
    expect(regimeOf('AE')).toBe('ae');
    expect(regimeOf('TR')).toBe('tr');
    expect(regimeOf('IN')).toBe('in');
    expect(regimeOf('CN')).toBe('cn');
    expect(regimeOf('DE')).toBe('eu');
    expect(regimeOf('FR')).toBe('eu');
    expect(regimeOf('ES')).toBe('eu');
    // Britain left the regulation and kept a copy of it, which is a separate
    // regime rather than a footnote in the European one.
    expect(regimeOf('GB')).toBe('uk');
  });

  it('falls through to a written default rather than to nothing', () => {
    // The default is a real policy written to the strictest common denominator,
    // which is what a product with no local entity should offer somewhere it has
    // not specifically looked. A country with no regime would be a page with no
    // law named on it.
    expect(regimeOf('NP')).toBe('default');
    expect(regimeOf('zz')).toBe('default');
    expect(REGIME_LAW.default.length).toBeGreaterThan(20);
  });
});

describe('the slug carries the country and the language', () => {
  it('formats and reads back the pair the owner asked for', () => {
    expect(slugOf('AE', 'ar')).toBe('ae-ar');
    expect(audienceOf('ae-ar', LOCALES)).toEqual({ country: 'AE', language: 'ar' });
    expect(audienceOf(slugOf('DE', 'de'), LOCALES)).toEqual({ country: 'DE', language: 'de' });
  });

  it('refuses a slug it does not recognise instead of guessing', () => {
    // The defect this prevents has no visible symptom: serving one country's
    // privacy policy to a reader in another is a legal statement made to the
    // wrong person, and a fallback is exactly how that ships.
    expect(audienceOf('xx-ar', LOCALES), 'unknown country').toBeNull();
    expect(audienceOf('ae-zz', LOCALES), 'unpublished language').toBeNull();
    expect(audienceOf('il-ar', LOCALES), 'a country not offered').toBeNull();
    expect(audienceOf('ae', LOCALES), 'language missing').toBeNull();
    expect(audienceOf('AE-AR', LOCALES), 'upper case').toBeNull();
    expect(audienceOf('', LOCALES)).toBeNull();
    expect(audienceOf('ae-ar-extra', LOCALES)).toBeNull();
  });

  it('is lower case on both halves, so one page is one URL', () => {
    // A URL that differs only by case is two URLs to a crawler and one to a
    // person, which is a duplicate content problem nobody can see.
    for (const country of ['AE', 'sa', 'Tr']) {
      expect(slugOf(country, 'AR')).toBe(slugOf(country.toLowerCase(), 'ar'));
      expect(slugOf(country, 'AR')).toBe(slugOf(country, 'AR').toLowerCase());
    }
  });
});
