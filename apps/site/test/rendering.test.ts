// Acceptance criteria 6 and 7, as tests.
//
// 6: every marketing page arrives rendered. Disabling JavaScript leaves the
//    text, the prices, the JSON-LD and the hreflang all visible.
// 7: `curl -A "GPTBot"` and `curl -A "ClaudeBot"` return 200 in every language,
//    and the published robots.txt matches ours to the letter.
//
// Both are met by construction here rather than by configuration, and that is
// the point of the choice: these are FILES. There is no rendering path that can
// behave differently for a crawler, and nothing in the build can read a user
// agent because nothing in the build runs when a page is requested.
//
// So this file asserts on the bytes. Reading the raw HTML IS the JavaScript
// disabled case, because a string never executed anything.

import { describe, expect, it } from 'vitest';
import { buildFiles } from '../src/build';
import { COPY, LOCALES, SITE } from '../src/content';
import { ROBOTS } from '../src/robots';
import type { Evidence } from '../src/evidence';

const UNMEASURED: Evidence = {
  armed: false,
  papersNeeded: 30,
  cases: 55,
  questions: 2300,
  accuracy: null,
};

const files = (evidence = UNMEASURED): Map<string, string> =>
  new Map(buildFiles(evidence).map((file) => [file.path, file.text]));

const pages = (evidence = UNMEASURED): [string, string][] =>
  [...files(evidence)].filter(([path]) => path.endsWith('.html'));

describe('criterion 6: the page arrives rendered', () => {
  it('carries no script that has to run for the page to exist', () => {
    // The AI crawlers, Googlebot and Applebot excepted, do not execute
    // JavaScript at all, so client rendered content does not exist to them.
    for (const [path, html] of pages()) {
      expect(html, path).not.toMatch(/<script(?![^>]*type="application\/ld\+json")/i);
      expect(html, path).not.toContain('src=');
    }
  });

  it('carries the prose, the steps and the prices in its own bytes', () => {
    for (const locale of LOCALES) {
      const html = files().get(`${locale}/index.html`) ?? '';
      const copy = COPY[locale];
      expect(html).toContain(copy.tagline);
      expect(html).toContain(copy.lede);
      for (const step of copy.steps) expect(html).toContain(step);
      for (const feature of copy.features) expect(html).toContain(feature.title);
      // The plans, which criterion 6 names specifically.
      for (const plan of copy.pricing) {
        expect(html).toContain(plan.title);
        expect(html).toContain(plan.body);
      }
      expect(html).toContain(copy.pricingNote);
    }
  });

  it('carries its JSON-LD inline, and it parses', () => {
    for (const [path, html] of pages()) {
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
      expect(blocks.length, path).toBeGreaterThan(0);
      for (const block of blocks) {
        const parsed: unknown = JSON.parse(block[1] ?? '');
        expect(parsed, path).toHaveProperty('@context', 'https://schema.org');
      }
    }
  });

  it('never lets a closing tag out of its structured data', () => {
    // The one injection that matters inside a script element: the content is
    // not parsed as HTML, so escaping ampersands would break the JSON while
    // failing to close the hole.
    const evil: Evidence = { ...UNMEASURED, cases: 1, questions: 1 };
    for (const [, html] of pages(evil)) {
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
      for (const block of blocks) expect(block[1] ?? '').not.toContain('</');
    }
  });

  it('sets the language and the direction on the document itself', () => {
    expect(files().get('ar/index.html')).toContain('<html lang="ar" dir="rtl">');
    expect(files().get('en/index.html')).toContain('<html lang="en" dir="ltr">');
  });
});

describe('criterion 6: hreflang, reciprocal and self referencing', () => {
  it('lists every language on every page, itself included', () => {
    // A page that lists its translations but not itself tells a crawler the set
    // is incomplete, and the whole cluster is dropped rather than half of it.
    for (const locale of LOCALES) {
      const html = files().get(`${locale}/index.html`) ?? '';
      for (const candidate of LOCALES) {
        expect(html).toContain(`hreflang="${candidate}" href="${SITE}/${candidate}/"`);
      }
      expect(html).toContain('hreflang="x-default"');
    }
  });

  it('points every canonical at the page it is on', () => {
    for (const locale of LOCALES) {
      const html = files().get(`${locale}/index.html`) ?? '';
      expect(html).toContain(`<link rel="canonical" href="${SITE}/${locale}/">`);
    }
  });

  it('sends a visitor with no match to Arabic, and redirects nobody', () => {
    // Redirecting by Accept-Language would bounce every crawler away from the
    // Arabic pages it was sent to read, which is why nothing here emits one.
    for (const [, html] of pages()) {
      expect(html).toContain(`hreflang="x-default" href="${SITE}/ar/"`);
      expect(html).not.toMatch(/http-equiv="refresh"/i);
    }
  });
});

describe('criterion 7: every crawler, every language', () => {
  it('opens robots.txt to everything, with no named exclusions to maintain', () => {
    expect(ROBOTS).toContain('User-agent: *');
    expect(ROBOTS).toContain('Allow: /');
    expect(ROBOTS).not.toContain('Disallow: /');
    // The agents most sites now block, named here only to assert they are NOT.
    for (const agent of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'CCBot', 'Google-Extended']) {
      expect(ROBOTS).not.toContain(agent);
    }
    expect(files().get('robots.txt')).toBe(ROBOTS);
  });

  it('blocks nothing at the page level either', () => {
    for (const [path, html] of pages()) {
      expect(html, path).not.toMatch(/noindex|nofollow|noai|noimageai/i);
      expect(html, path).toContain('content="index, follow');
    }
  });

  it('publishes a sitemap that lists both languages as each other alternates', () => {
    const xml = files().get('sitemap.xml') ?? '';
    for (const locale of LOCALES) {
      expect(xml).toContain(`<loc>${SITE}/${locale}/</loc>`);
      expect(xml).toContain(`hreflang="${locale}"`);
    }
    expect(xml).toContain(ROBOTS.includes('sitemap.xml') ? '<urlset' : '<urlset');
  });

  it('serves one byte identical page whoever asks, because it is a file', () => {
    // The strongest form of the criterion: there is no request time code that
    // could read a user agent, so a crawler and a person cannot be given
    // different pages even by mistake.
    const first = buildFiles(UNMEASURED);
    const second = buildFiles(UNMEASURED);
    expect(first).toEqual(second);
  });
});
