// The document shell, and the one rule the whole marketing site rests on.
//
// EVERY PAGE IS COMPLETE IN ITS OWN BYTES. docs/DISCOVERABILITY.md section 1
// is the reason: the AI crawlers, Googlebot and Applebot excepted, do not run
// JavaScript at all, so anything rendered on the client does not exist to them.
// Acceptance criterion 6 states it as a test a build has to pass, which is why
// this file emits no script tag of any kind and `test/rendering.test.ts` fails
// the build if one appears.
//
// That is also why the site is not built with the framework the stack picked
// for the dashboard. A marketing page that must survive with JavaScript
// disabled has nothing to gain from a hydration bundle it is forbidden to
// depend on, and two other reasons are in DEVLOG: the framework's own optional
// dependency is the one package this project banned by name, and the dashboard
// and the marketing site are different products with different requirements.

export interface Alternate {
  readonly locale: string;
  readonly href: string;
}

export interface PageDocument {
  readonly locale: string;
  readonly dir: 'rtl' | 'ltr';
  readonly title: string;
  readonly description: string;
  /** Absolute, and self referencing: every language page points at itself. */
  readonly canonical: string;
  readonly alternates: readonly Alternate[];
  /** One or more JSON-LD objects, emitted as their own script type. */
  readonly structured: readonly Record<string, unknown>[];
  readonly body: string;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replaceAll(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * JSON-LD, escaped for the one context that is not ordinary HTML.
 *
 * The content of a script element is not parsed as HTML, so `&amp;` would
 * arrive literally and break the JSON. What must be neutralised instead is the
 * sequence that ends the element early, which is the injection this needs to be
 * safe against at all.
 */
function jsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

/**
 * hreflang, reciprocal and self referencing.
 *
 * DISCOVERABILITY section 6 makes both mandatory and they are the pair that is
 * usually got wrong: a page that lists its translations but not itself tells a
 * crawler the set is incomplete, and Google drops the whole cluster rather than
 * half of it. `x-default` names the language a visitor with no match is sent
 * to, and it is Arabic here because this is a product for Arabic speaking
 * teachers first.
 */
function alternatesOf(page: PageDocument, xDefault: string): string {
  const links = page.alternates.map(
    (alternate) =>
      `<link rel="alternate" hreflang="${escapeHtml(alternate.locale)}" href="${escapeHtml(alternate.href)}">`,
  );
  links.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(xDefault)}">`);
  return links.join('');
}

export function renderDocument(page: PageDocument, xDefault: string): string {
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    // No noindex, no nofollow, no crawler carve outs. Section 2 of
    // DISCOVERABILITY is a policy of full opening, and the silent failure it
    // warns about is a default somewhere else quietly closing it.
    '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">',
    `<link rel="canonical" href="${escapeHtml(page.canonical)}">`,
    alternatesOf(page, xDefault),
    `<link rel="stylesheet" href="/style.css">`,
    ...page.structured.map(
      (value) => `<script type="application/ld+json">${jsonLd(value)}</script>`,
    ),
  ].join('');

  return `<!doctype html>
<html lang="${escapeHtml(page.locale)}" dir="${page.dir}">
<head>${head}</head>
<body>
${page.body}
</body>
</html>
`;
}
