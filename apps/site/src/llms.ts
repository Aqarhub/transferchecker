// llms.txt, and the honest verdict that comes with it.
//
// DISCOVERABILITY section 8 is blunt about what this file is worth: no major
// provider endorses it, Google stated in June 2026 that Search does not use it
// and that its presence neither helps nor hurts, and an Ahrefs study across
// about 137,000 sites found 97 percent of these files never received a single
// request. The decision recorded there is to publish it anyway, for one reason
// and with one condition:
//
//   THE REASON: it costs half an hour and its harm is zero.
//   THE CONDITION: generate it from the same source as the sitemap so it cannot
//   go stale. And do not treat it as a lever, or give it one minute at the
//   expense of server rendering or of the content.
//
// This file is that condition, made structural. Every line below is derived from
// `COPY` and `LOCALE_INFO`, the same two things the pages, the hreflang clusters
// and the sitemap are built from. There is no separate copy of the product
// description here to fall behind the page, which is the failure mode that makes
// most llms.txt files worse than absent: an assistant quoting a price the site
// stopped charging a year ago.
//
// WHAT GETS WRITTEN, in every language:
//   /llms.txt                  the index, naming every language
//   /<locale>/llms.txt         that language's short map, with links
//   /<locale>/llms-full.txt    that language's whole page as Markdown
//
// The split is the one the format proposes: the short file is a map an assistant
// reads to decide what to fetch, and the full file is the text itself so that
// deciding is often unnecessary. Both are plain Markdown, which is the only part
// of the proposal that is unambiguous.

import { COPY, LOCALE_INFO, SITE } from './content';
import type { Copy, Locale } from './content';
import type { Evidence } from './evidence';
import { pathOf, urlOf } from './pages';

/**
 * The page anchors, which are the same ids `pages.ts` renders.
 *
 * Repeated here because the two files are written in different languages, and
 * held together by a test rather than by care: `crawlers.test.ts` follows every
 * fragment these links carry into the built HTML and fails if the element is not
 * there. A dead anchor in a file whose whole purpose is to be a map is worse
 * than no map.
 */
type SectionId = 'steps' | 'features' | 'accuracy' | 'privacy' | 'scope' | 'pricing' | 'faq';

interface Section {
  readonly id: SectionId;
  readonly title: string;
  /** One line, in this language, saying what is behind the link. */
  readonly gist: string;
  /** The section as Markdown, for the full file. */
  readonly body: string;
}

const bullets = (items: readonly { title: string; body: string }[]): string =>
  items.map((item) => `- **${item.title}**: ${item.body}`).join('\n');

const numbered = (items: readonly string[]): string =>
  items.map((item, at) => `${String(at + 1)}. ${item}`).join('\n');

/**
 * The page, decomposed once, and read by both files.
 *
 * The gist of each link is drawn from the section's own content rather than
 * written again beside it. That is what stops the two from disagreeing: there is
 * nothing here a contributor could update in one place and not the other.
 */
function sectionsOf(copy: Copy, evidence: Evidence): Section[] {
  const join = copy.listSeparator;
  return [
    {
      id: 'steps',
      title: copy.stepsTitle,
      gist: copy.steps[0] ?? '',
      body: numbered(copy.steps),
    },
    {
      id: 'features',
      title: copy.featuresTitle,
      gist: copy.features.map((feature) => feature.title).join(join),
      body: bullets(copy.features),
    },
    {
      id: 'accuracy',
      title: copy.accuracyTitle,
      // The accuracy sentence is the measurement, so the gist IS the sentence:
      // summarising it here is how a "99.7 percent" appears on a site that has
      // measured nothing.
      gist: copy.accuracy(evidence),
      body: copy.accuracy(evidence),
    },
    { id: 'privacy', title: copy.privacyTitle, gist: copy.privacy, body: copy.privacy },
    { id: 'scope', title: copy.scopeTitle, gist: copy.scope, body: copy.scope },
    {
      id: 'pricing',
      title: copy.pricingTitle,
      gist: copy.pricing.map((plan) => plan.title).join(join),
      body: `${bullets(copy.pricing)}\n\n${copy.pricingNote}`,
    },
    {
      id: 'faq',
      title: copy.faqTitle,
      // The questions alone as the gist, because that is what an assistant
      // matches a user's question against before it decides to fetch anything.
      gist: copy.faq.map((entry) => entry.q).join(join),
      // As Markdown headings rather than a bullet list: the whole point of this
      // section is that a question and its answer travel together when a
      // retriever cuts one out.
      body: copy.faq.map((entry) => `### ${entry.q}\n\n${entry.a}`).join('\n\n'),
    },
  ];
}

/** Every language, as Markdown links, in registry order and by its own name. */
function languageLinks(file: string): string {
  return LOCALE_INFO.map((entry) => `- [${entry.name}](${SITE}${pathOf(entry.code)}${file})`).join(
    '\n',
  );
}

/**
 * One language's short map.
 *
 * Written in that language, because an assistant answering a question in Turkish
 * is better served by the Turkish sentence than by an English one it would have
 * to translate back.
 */
export function llmsOf(locale: Locale, evidence: Evidence): string {
  const copy = COPY[locale];
  const page = urlOf(locale);
  const links = sectionsOf(copy, evidence)
    .map((section) => `- [${section.title}](${page}#${section.id}): ${section.gist}`)
    .join('\n');

  return `# ${copy.name}: ${copy.tagline}

> ${copy.summary}

${copy.lede}

## ${copy.pageWord}

- [${copy.title}](${page}): ${copy.description}
${links}
- [llms-full.txt](${page}llms-full.txt): ${copy.summary}

## ${copy.languagesTitle}

${languageLinks('llms.txt')}
`;
}

/** One language's whole page, as Markdown, with nothing left behind a link. */
export function llmsFullOf(locale: Locale, evidence: Evidence): string {
  const copy = COPY[locale];
  const body = sectionsOf(copy, evidence)
    .map((section) => `## ${section.title}\n\n${section.body}`)
    .join('\n\n');

  return `# ${copy.name}: ${copy.tagline}

> ${copy.summary}

${copy.lede}

${body}

## ${copy.languagesTitle}

${languageLinks('llms-full.txt')}
`;
}

/**
 * The index at the root, which is the only one written in English.
 *
 * Not a language choice about readers: this file's whole content is a list of
 * the others, and the reader that fetches `/llms.txt` has not told us anything
 * about what it reads. Each entry is labelled by the language's own name, which
 * needs no translation, so the English here is scaffolding around eight labels
 * that are already correct in eight languages.
 */
export function llmsIndex(): string {
  const rows = LOCALE_INFO.map(
    (entry) =>
      `- [${entry.name}](${SITE}${pathOf(entry.code)}llms.txt): ${COPY[entry.code].summary}`,
  ).join('\n');

  return `# ${COPY.en.name}

> ${COPY.en.summary}

This file is an index. Every language below has its own llms.txt with the same
content in that language, and an llms-full.txt with the whole page as text.

## Languages

${rows}

## Also

- [Sitemap](${SITE}/sitemap.xml): every page in every language, with its alternates.
- [robots.txt](${SITE}/robots.txt): one open rule, no crawler is excluded.
`;
}
