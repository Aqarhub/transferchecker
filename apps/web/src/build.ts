// Building every screen in every language, as files.
//
// The same choice the marketing site made and for a stronger reason here: a
// dashboard whose every screen exists as a complete document can be opened,
// screenshotted, diffed and compared across languages without a server, which
// is what makes "the layout does not break when you switch language" a thing a
// test can check rather than a thing somebody remembers to look at.
//
// The screens take a `Dashboard` rather than reaching for one, so the rendering
// has one input and the tests render through exactly this path. Where that
// dashboard is read from is `src/source.ts`, and today it is a PostgreSQL that
// boots inside the build.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import {
  APP_CSS,
  LOCALES,
  esc,
  localeOf,
  resetHelpIds,
  shell,
  tokensCss,
} from '@transferchecker/ui';
import { BUILT_LOCALES, COPY } from './copy';
import type { Copy } from './copy';
import { demoDashboard } from './source';
import type { Dashboard } from './data';
import { SCREENS, pathOf, screen } from './screens';
import type { Screen } from './screens';

const NAV: readonly { key: Screen; glyph: string }[] = [
  { key: 'exams', glyph: 'exams' },
  { key: 'students', glyph: 'students' },
  { key: 'sheets', glyph: 'sheets' },
  { key: 'settings', glyph: 'settings' },
];

/** Which sidebar item is lit for a screen. The exam detail belongs to Exams. */
const owner = (name: Screen): Screen => (name === 'exam' ? 'exams' : name);

export interface BuiltFile {
  readonly path: string;
  readonly text: string;
}

/**
 * One screen, in one language, as a whole document.
 *
 * The `override` is for the pseudo locale in `test/locale.test.ts`, which
 * lengthens every string by about 35 percent to stand in for German compounds
 * and Turkish suffixes. It is never used by a build: the parameter exists so the
 * test renders through exactly this path rather than through a copy of it.
 */
export function pageOf(locale: string, name: Screen, data: Dashboard, override?: Copy): string {
  const copy = override ?? COPY[locale];
  const info = localeOf(locale);
  if (copy === undefined) return '';
  // Reset so two builds of one page are byte identical, which is what lets a
  // language comparison be a diff rather than a judgement.
  resetHelpIds();

  const languages = BUILT_LOCALES.map((code) => ({
    code,
    // The SAME screen in the other language, never the home page. A switcher
    // that loses your place is the most cited complaint about bilingual apps.
    href: pathOf(code, name),
    name: localeOf(code).name,
    current: code === locale,
  }));

  const body = shell({
    locale: info,
    brand: copy.brand,
    nav: NAV.map((item) => ({
      key: item.key,
      href: pathOf(locale, item.key),
      label:
        copy.nav[
          item.key === 'exams'
            ? 'exams'
            : item.key === 'students'
              ? 'students'
              : item.key === 'sheets'
                ? 'sheets'
                : 'settings'
        ],
      glyph: item.glyph,
    })),
    active: owner(name),
    sync: {
      label: copy.sync.label,
      lastSync: copy.sync.last,
      pending: 2,
      pendingLabel: copy.sync.pending,
    },
    languages,
    skipLabel: copy.skip,
    navLabel: copy.navLabel,
    body: screen(
      name,
      copy,
      locale,
      LOCALES.filter((entry) => BUILT_LOCALES.includes(entry.code)),
      data,
    ),
  });

  const alternates = BUILT_LOCALES.map(
    (code) => `<link rel="alternate" hreflang="${code}" href="${pathOf(code, name)}">`,
  ).join('');

  return `<!doctype html>
<html lang="${esc(locale)}" dir="${info.dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(copy.brand)}</title>
<meta name="robots" content="noindex">
${alternates}
<link rel="stylesheet" href="/app.css">
</head>
<body>
${body}
</body>
</html>
`;
}

export function buildFiles(data: Dashboard): BuiltFile[] {
  const files: BuiltFile[] = [];
  for (const locale of BUILT_LOCALES) {
    for (const name of SCREENS) {
      files.push({
        path: `${pathOf(locale, name).replace(/^\//, '')}index.html`,
        text: pageOf(locale, name, data),
      });
    }
  }
  files.push({ path: 'app.css', text: `${tokensCss()}\n${APP_CSS}` });
  return files;
}

async function main(): Promise<void> {
  const out = resolve(process.argv[2] ?? 'out');
  const files = buildFiles(await demoDashboard());
  for (const file of files) {
    const target = join(out, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.text);
    process.stdout.write(`${file.path}\n`);
  }
  process.stdout.write(`\n${String(files.length)} files in ${out}\n`);
}

if (process.argv[1]?.endsWith('build.ts') === true) await main();
