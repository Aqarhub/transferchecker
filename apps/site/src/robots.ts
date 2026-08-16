// robots.txt and the sitemap, and the policy behind both is one sentence.
//
// EVERY CRAWLER IS ALLOWED, IN EVERY LANGUAGE. DISCOVERABILITY section 2 is a
// policy of full opening, including the AI crawlers that most sites now block,
// because this product's readers increasingly ask an assistant before they ask
// a search engine, and a blocked crawler is a product that does not exist to
// them. There is no carve out here to keep in step with anything.
//
// The file is a single allow rule rather than a list of named agents on
// purpose. A list has to be maintained, a crawler that appears next month is
// silently excluded from it, and acceptance criterion 7 compares the PUBLISHED
// file against this one byte for byte, so every entry is a thing that can drift.
//
// Section 3 names the failure this cannot fix: a host that blocks crawlers by
// default in front of us. That is a deployment check and not a file, and it is
// the highest probability silent failure in the whole project.

import { LOCALES, SITE } from './content';
import { pathOf } from './pages';

export const ROBOTS = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

/**
 * The sitemap, with every language of every page listed as an alternate.
 *
 * The same reciprocity rule the pages carry in their head, repeated here
 * because the two are read by different parts of a crawler and disagreeing is
 * worse than either being absent.
 */
export function sitemap(): string {
  const entries = LOCALES.map((locale) => {
    const alternates = LOCALES.map(
      (candidate) =>
        `    <xhtml:link rel="alternate" hreflang="${candidate}" href="${SITE}${pathOf(candidate)}"/>`,
    ).join('\n');
    return `  <url>
    <loc>${SITE}${pathOf(locale)}</loc>
${alternates}
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;
}
