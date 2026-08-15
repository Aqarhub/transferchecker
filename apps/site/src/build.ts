// The build: a directory of files, and nothing that runs at request time.
//
// The strongest form of "server rendered" is that there is no server. Every
// page here is a complete file on disk, so acceptance criterion 6 cannot be
// failed by a rendering path that behaves differently for a crawler, and
// criterion 7's requirement that every agent gets the same 200 is true by
// construction rather than by configuration: there is nothing here that could
// look at a user agent.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LOCALE, LOCALES } from './content';
import { readEvidence } from './evidence';
import type { Evidence } from './evidence';
import { renderDocument } from './html';
import { pageOf, pathOf, urlOf } from './pages';
import { ROBOTS, sitemap } from './robots';
import { STYLE } from './style';

/** The report this site is allowed to quote, which lives in the engine's package. */
export function reportPath(): string {
  return resolve(
    fileURLToPath(new URL('.', import.meta.url)),
    '../../../packages/core-omr/golden-report.json',
  );
}

export interface BuiltFile {
  readonly path: string;
  readonly text: string;
}

/** Everything the site is, as files, without touching a disk. */
export function buildFiles(evidence: Evidence): BuiltFile[] {
  const files: BuiltFile[] = LOCALES.map((locale) => ({
    path: `${pathOf(locale)}index.html`.replace(/^\//, ''),
    text: renderDocument(pageOf(locale, evidence), urlOf(DEFAULT_LOCALE)),
  }));

  files.push({ path: 'robots.txt', text: ROBOTS });
  files.push({ path: 'sitemap.xml', text: sitemap() });
  files.push({ path: 'style.css', text: STYLE });
  // The bare root redirects nothing and guesses nothing: it is a page that
  // links to both languages, because sending a visitor by `Accept-Language`
  // would send every crawler away from the Arabic pages it came to read.
  files.push({
    path: 'index.html',
    text: renderDocument(pageOf(DEFAULT_LOCALE, evidence), urlOf(DEFAULT_LOCALE)),
  });
  return files;
}

function main(): void {
  const out = resolve(process.argv[2] ?? 'out');
  const files = buildFiles(readEvidence(reportPath()));
  for (const file of files) {
    const target = join(out, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.text);
    process.stdout.write(`${file.path}\n`);
  }
  process.stdout.write(`\n${String(files.length)} files in ${out}\n`);
}

// Only when run as a command, so the tests can import `buildFiles` in peace.
if (process.argv[1]?.endsWith('build.ts') === true) main();
