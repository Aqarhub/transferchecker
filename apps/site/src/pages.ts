// The pages, as documents rather than as components.
//
// One page per language for now, at `/ar/` and `/en/`, which is the subfolder
// structure DISCOVERABILITY section 6 settles on. Subfolders and not subdomains
// or a query parameter, because a subfolder inherits the domain's standing and
// a crawler treats the set as one site.

import { COPY, LOCALE_INFO, LOCALES, SITE, localeOf } from './content';
import type { Copy, Locale } from './content';
import type { Evidence } from './evidence';
import { escapeHtml } from './html';
import type { PageDocument } from './html';

export const pathOf = (locale: Locale): string => `/${locale}/`;
export const urlOf = (locale: Locale): string => `${SITE}${pathOf(locale)}`;

const list = (items: readonly string[]): string =>
  `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;

const cards = (items: readonly { title: string; body: string }[]): string =>
  items
    .map(
      (item) =>
        `<article><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`,
    )
    .join('');

/**
 * The language switcher, and it is a real list rather than a toggle.
 *
 * Every language is named in its own name, which is the only naming a reader can
 * be expected to recognise, and every link goes to the SAME page in the other
 * language rather than to a home page. Each carries `hreflang` and `lang` so
 * that a screen reader switches voice on the label and a crawler reads the
 * relationship from the markup as well as from the head.
 *
 * It is rendered on the page rather than behind a control on purpose: this site
 * ships no JavaScript, and a language menu that needs a script is a menu that
 * does not exist for the crawlers section 1 is about.
 */
function switcher(copy: Copy, locale: Locale): string {
  const links = LOCALE_INFO.map((entry) => {
    const current = entry.code === locale ? ' aria-current="true"' : '';
    return `<li><a href="${pathOf(entry.code)}" hreflang="${entry.code}" lang="${entry.code}"${current}>${escapeHtml(entry.name)}</a></li>`;
  }).join('');
  return `<nav class="switch" aria-label="${escapeHtml(copy.languagesTitle)}"><ul>${links}</ul></nav>`;
}

function bodyOf(copy: Copy, locale: Locale, evidence: Evidence): string {
  return `<header>
<p class="brand">${escapeHtml(copy.name)}</p>
<h1>${escapeHtml(copy.tagline)}</h1>
<p class="lede">${escapeHtml(copy.lede)}</p>
${switcher(copy, locale)}
</header>
<main>
<section id="steps"><h2>${escapeHtml(copy.stepsTitle)}</h2>${list(copy.steps)}</section>
<section id="features"><h2>${escapeHtml(copy.featuresTitle)}</h2>${cards(copy.features)}</section>
<section id="accuracy"><h2>${escapeHtml(copy.accuracyTitle)}</h2><p>${escapeHtml(copy.accuracy(evidence))}</p></section>
<section id="privacy"><h2>${escapeHtml(copy.privacyTitle)}</h2><p>${escapeHtml(copy.privacy)}</p></section>
<section id="scope"><h2>${escapeHtml(copy.scopeTitle)}</h2><p>${escapeHtml(copy.scope)}</p></section>
<section id="pricing"><h2>${escapeHtml(copy.pricingTitle)}</h2>${cards(copy.pricing)}<p>${escapeHtml(copy.pricingNote)}</p></section>
</main>
<footer><p>${escapeHtml(copy.name)}</p></footer>`;
}

/**
 * The structured data, kept to the two types that are still read.
 *
 * DISCOVERABILITY section 5 records which markup Google actually dropped, and
 * the answer is most of it. What remains useful is saying what the thing is and
 * who made it, so that is all this emits: a padded graph is a maintenance cost
 * with no reader.
 */
function structuredOf(copy: Copy, locale: Locale): Record<string, unknown>[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: copy.name,
      description: copy.description,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Android, iOS',
      inLanguage: locale,
      url: urlOf(locale),
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'SAR',
        description: copy.pricing[0]?.body ?? '',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: copy.name,
      url: SITE,
    },
  ];
}

export function pageOf(locale: Locale, evidence: Evidence): PageDocument {
  const copy = COPY[locale];
  return {
    locale,
    dir: localeOf(locale).dir,
    title: copy.title,
    description: copy.description,
    // Self referencing, always. A canonical that points at the other language
    // is how a whole language disappears from an index.
    canonical: urlOf(locale),
    alternates: LOCALES.map((candidate) => ({ locale: candidate, href: urlOf(candidate) })),
    structured: structuredOf(copy, locale),
    body: bodyOf(copy, locale, evidence),
  };
}
