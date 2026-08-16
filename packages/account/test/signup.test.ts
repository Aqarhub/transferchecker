// Signing up, the password rules, and the consent record.
//
// The assertions that earn their place here are about the country, because the
// country is the field that looks like a preference and is a legal decision:
// it selects which privacy law this account sits under and which document the
// person is agreeing to. Getting it wrong has no visible symptom.

import { describe, expect, it } from 'vitest';
import { checkSignup } from '../src/signup';
import {
  MIN_LENGTH,
  checkPassword,
  graphemes,
  hibpQuery,
  isBreached,
  normalise,
} from '../src/password';
import { consentFor, isCurrent, outstanding } from '../src/consent';
import type { Consent } from '../src/consent';
import type { Regime } from '../src/countries';

const LANGUAGES = ['ar', 'en', 'de', 'es', 'fr', 'hi', 'tr', 'zh'];
const VERSION = '2026-08-16';
const context = {
  languages: LANGUAGES,
  currentPolicyVersion: (): string => VERSION,
};

const good = {
  email: 'muallim@example.com',
  password: 'correct horse battery staple',
  country: 'AE',
  language: 'ar',
  policyVersion: VERSION,
};

const why = (result: ReturnType<typeof checkSignup>, field: string): string[] =>
  result.ok ? [] : result.problems.filter((p) => p.field === field).map((p) => p.why);

describe('the country is a legal decision, not a preference', () => {
  it('derives the regime from the country rather than trusting the client', () => {
    const out = checkSignup(good, context);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.account.country).toBe('AE');
      expect(out.account.regime, 'the UAE has its own decree-law').toBe('ae');
    }
    // The same form, a different country, a different law.
    const german = checkSignup({ ...good, country: 'DE', language: 'de' }, context);
    if (german.ok) expect(german.account.regime).toBe('eu');
  });

  it('refuses a country the owner decided not to offer', () => {
    // Falling through to a default policy here would be selling into a market
    // the owner withheld, quietly, through a validation gap.
    expect(why(checkSignup({ ...good, country: 'IL' }, context), 'country')).toEqual([
      'not-offered',
    ]);
    expect(why(checkSignup({ ...good, country: 'XX' }, context), 'country')).toEqual([
      'not-offered',
    ]);
  });

  it('refuses a language it has no policy written in', () => {
    // A person cannot consent to a document they cannot read.
    expect(why(checkSignup({ ...good, language: 'ja' }, context), 'language')).toEqual([
      'not-published',
    ]);
  });

  it('accepts the country in either case and stores one form', () => {
    const lower = checkSignup({ ...good, country: 'ae', language: 'AR' }, context);
    expect(lower.ok).toBe(true);
    if (lower.ok) {
      expect(lower.account.country).toBe('AE');
      expect(lower.account.language).toBe('ar');
    }
  });
});

describe('consent is to a version, not to a checkbox', () => {
  it('refuses agreement to a policy that is no longer live', () => {
    // A record saying "agreed" without saying to what is worthless the day the
    // document changes, which is the day it matters.
    expect(
      why(checkSignup({ ...good, policyVersion: '2025-01-01' }, context), 'policyVersion'),
    ).toEqual(['stale']);
  });

  it('asks each regime for its own live version', () => {
    // Regimes move independently: a Saudi policy can be reissued without
    // touching the European one, and pinning one version across all of them
    // would force the world to re consent for a change that did not affect it.
    const perRegime = {
      languages: LANGUAGES,
      currentPolicyVersion: (regime: Regime): string =>
        regime === 'ae' ? '2026-08-16' : '2026-01-01',
    };
    expect(checkSignup(good, perRegime).ok, 'UAE on its own version').toBe(true);
    expect(checkSignup({ ...good, country: 'DE', language: 'de' }, perRegime).ok).toBe(false);
  });

  it('names the document, the version, the country and the moment', () => {
    const record = consentFor({
      userId: 'u1',
      document: 'privacy',
      regime: 'ae',
      country: 'AE',
      language: 'ar',
      version: VERSION,
      at: 1_760_000_000_000,
    });
    expect(record.version).toBe(VERSION);
    expect(record.language, 'they consented to what they read').toBe('ar');
    expect(isCurrent(record, VERSION)).toBe(true);
    expect(isCurrent(record, '2026-09-01'), 'a newer policy is not agreed').toBe(false);
  });

  it('refuses a version that is not a date', () => {
    // A counter invites a bump for a typo fix, which forces re consent from
    // everybody for nothing. A date sorts and answers "which was live in March".
    expect(() =>
      consentFor({
        userId: 'u1',
        document: 'terms',
        regime: 'eu',
        country: 'DE',
        language: 'de',
        version: 'v2',
        at: 0,
      }),
    ).toThrow();
  });

  it('names only the documents still outstanding', () => {
    // Asking again for what was already agreed teaches people to click through,
    // which is the behaviour these rules exist to prevent.
    const held: Consent[] = [
      consentFor({
        userId: 'u1',
        document: 'privacy',
        regime: 'ae',
        country: 'AE',
        language: 'ar',
        version: VERSION,
        at: 0,
      }),
    ];
    expect(outstanding(held, { privacy: VERSION, terms: VERSION })).toEqual(['terms']);
    expect(outstanding(held, { privacy: '2026-12-01', terms: VERSION })).toEqual([
      'privacy',
      'terms',
    ]);
    expect(outstanding([], { privacy: VERSION, terms: VERSION })).toEqual(['privacy', 'terms']);
  });
});

describe('the password rules, which are mostly rules against rules', () => {
  it('asks for length and nothing else', () => {
    // NIST 800-63B revision 4 recommends AGAINST composition rules: a symbol, a
    // digit and a capital each push a user toward a shorter, more predictable
    // password. So a long passphrase of nothing but lowercase letters passes.
    expect(checkPassword('correct horse battery staple').ok).toBe(true);
    expect(checkPassword('a'.repeat(MIN_LENGTH)).ok).toBe(true);
    expect(checkPassword('Sh0rt!Pass').problems).toContain('too-short');
  });

  it('counts the way a person counts, not the way UTF-16 does', () => {
    // Fifteen emoji are fifteen characters to whoever typed them, and thirty
    // UTF-16 units. Counting units would wave through a password half the
    // required length.
    expect('🔑'.repeat(15).length, 'UTF-16 disagrees').toBe(30);
    expect(graphemes('🔑'.repeat(15))).toBe(15);
    expect(checkPassword('🔑'.repeat(15)).problems).not.toContain('too-short');
    expect(checkPassword('🔑'.repeat(7)).problems).toContain('too-short');
    // A flag is two code points and one character, and a family is seven and
    // one. Grapheme counting is the strictest of the three readings, which is
    // the direction a length rule should err in.
    expect(graphemes('🇸🇦'), 'a flag').toBe(1);
    expect(graphemes('👨‍👩‍👧‍👦'), 'a family').toBe(1);
    expect(checkPassword('🇸🇦'.repeat(8)).problems, 'eight flags are eight').toContain('too-short');
  });

  it('normalises, so one passphrase is not two passwords', () => {
    // The same phrase typed on two keyboards can arrive composed or decomposed.
    // Without this a user sets a password on a phone, cannot log in from a
    // laptop, and the failure looks exactly like having forgotten it.
    const composed = 'mot de passe très légitime';
    const decomposed = composed.normalize('NFD');
    expect(decomposed).not.toBe(composed);
    expect(normalise(decomposed)).toBe(normalise(composed));
  });

  it('refuses a password built from the email, and whitespace pretending to be one', () => {
    expect(
      checkPassword('muallim is my password', { email: 'muallim@example.com' }).problems,
    ).toContain('looks-like-the-email');
    expect(checkPassword(' '.repeat(20)).problems).toContain('only-whitespace');
  });

  it('reports every problem at once rather than one per round trip', () => {
    const check = checkPassword('short', { email: 'short@example.com', breached: true });
    expect(new Set(check.problems)).toEqual(
      new Set(['too-short', 'breached', 'looks-like-the-email']),
    );
  });
});

describe('the breach check, and what makes asking it safe', () => {
  it('sends five characters and keeps the rest', () => {
    // k-anonymity: the service learns that somebody asked about one of a few
    // hundred hashes and never which, and the password itself never leaves.
    const query = hibpQuery('correct horse battery staple');
    expect(query.prefix).toMatch(/^[0-9A-F]{5}$/);
    expect(query.suffix).toMatch(/^[0-9A-F]{35}$/);
    expect(`${query.prefix}${query.suffix}`.length, 'a whole SHA-1').toBe(40);
  });

  it('finds its own suffix in a range response, and only its own', () => {
    const query = hibpQuery('correct horse battery staple');
    const body = `0000000000000000000000000000000000A:12\r\n${query.suffix}:9\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1`;
    expect(isBreached(body, query)).toBe(true);
    expect(isBreached(body, hibpQuery('a different passphrase entirely'))).toBe(false);
  });

  it('treats a broken or empty answer as not found rather than throwing', () => {
    // A breach service that is down must not be able to stop people signing up.
    // Not found is the safe direction only because the length rule still holds.
    const query = hibpQuery('correct horse battery staple');
    for (const body of ['', '\n\n', 'garbage', ':::']) {
      expect(isBreached(body, query), JSON.stringify(body)).toBe(false);
    }
  });
});

describe('the form gets every problem at once', () => {
  it('reports the country, the language, the password and the version together', () => {
    const out = checkSignup(
      { ...good, country: 'IL', language: 'ja', password: 'short', policyVersion: '2020-01-01' },
      context,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      const fields = new Set(out.problems.map((problem) => problem.field));
      expect(fields).toEqual(new Set(['country', 'language', 'password', 'policyVersion']));
    }
  });

  it('rejects a malformed request without throwing', () => {
    for (const bad of [null, {}, { email: 'not-an-email' }, { ...good, email: 'a@b' }]) {
      const out = checkSignup(bad, context);
      expect(out.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('lowercases the email it stores, because a mailbox is not case sensitive', () => {
    const out = checkSignup({ ...good, email: 'Muallim@Example.COM' }, context);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.account.email).toBe('muallim@example.com');
  });
});
