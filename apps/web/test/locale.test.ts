// The promise that switching language breaks nothing, as a test.
//
// The requirement was stated plainly and it is stronger than "translate the
// strings": no break in the layout, and none when moving between pages or
// between languages. That is three separate properties, and each one has a
// mechanical form:
//
//   ONE DOM FOR EVERY LANGUAGE. Every screen renders the same elements in the
//   same order in every locale. Only the text, the `dir` and the font differ.
//   If the structures are identical, there is no branch a translation can take
//   that the layout has not already seen, and Arabic cannot be the only language
//   that was ever looked at.
//
//   THE SAME PATH IN EVERY LANGUAGE. `/ar/students/` and `/en/students/` are the
//   same screen, so the switcher keeps you where you were. Losing your place on
//   a language switch is the most cited complaint about bilingual products, and
//   it is a routing decision rather than a translation one.
//
//   AND IT SURVIVES A LONGER LANGUAGE. German compounds and Turkish suffixes run
//   about 35 percent longer than English, and a layout is only KNOWN to survive
//   that if something has actually tried it. The pseudo locale tries it.
//
// What this cannot check is pixels: a string can be structurally fine and still
// overflow its box. That was measured separately in a real browser at 390 pixels
// wide, comparing `documentElement.scrollWidth` against the viewport, and the
// findings are recorded in DEVLOG. This file holds the line that measurement
// established.

import { describe, expect, it } from 'vitest';
import { localeOf, pseudo } from '@transferchecker/ui';
import { buildFiles, pageOf } from '../src/build';
import { BUILT_LOCALES, COPY } from '../src/copy';
import type { Copy } from '../src/copy';
import { SCREENS, pathOf } from '../src/screens';
import { demoDashboard } from '../src/source';

// One database for the whole file. The pages under test are rendered from the
// rows it holds, which is what makes this a test of the real build rather than
// of a fixture that resembles it.
const DATA = await demoDashboard();
const page = (locale: string, screen: (typeof SCREENS)[number], override?: Copy): string =>
  pageOf(locale, screen, DATA, override);

/**
 * A page reduced to its shape: every element, in order, with its classes.
 *
 * Text is deliberately thrown away. Two pages with the same skeleton lay out
 * the same whatever they say, and that is exactly the claim being tested.
 */
const skeleton = (html: string): string[] =>
  [...html.matchAll(/<([a-z][a-z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)].map((match) => {
    const tag = (match[1] ?? '').toLowerCase();
    const found = /class="([^"]*)"/.exec(match[2] ?? '');
    return `${tag}.${found?.[1] ?? ''}`;
  });

/** The same screen in every language, which is what gets compared. */
const shapesOf = (screen: (typeof SCREENS)[number]): Map<string, string[]> =>
  new Map(BUILT_LOCALES.map((locale) => [locale, skeleton(page(locale, screen))]));

describe('one DOM for every language', () => {
  it('renders the same elements in the same order in every locale', () => {
    for (const screen of SCREENS) {
      const shapes = [...shapesOf(screen)];
      const [first] = shapes;
      if (first === undefined) continue;
      for (const [locale, shape] of shapes) {
        expect(shape, `${screen} in ${locale}`).toEqual(first[1]);
      }
    }
  });

  it('sets the language and the direction from the registry, on the document', () => {
    for (const locale of BUILT_LOCALES) {
      const info = localeOf(locale);
      expect(page(locale, 'exam')).toContain(`<html lang="${locale}" dir="${info.dir}">`);
    }
  });

  it('never renders a language name in another language', () => {
    // The switcher lists endonyms, which is the only naming a reader can be
    // expected to recognise, and which is also why the same eight strings are
    // correct on all eight pages.
    for (const locale of BUILT_LOCALES) {
      const html = page(locale, 'settings');
      for (const code of BUILT_LOCALES) {
        expect(html, `${locale} is missing ${code}`).toContain(localeOf(code).name);
      }
    }
  });
});

describe('the same path in every language', () => {
  it('keeps you on the screen you were on', () => {
    for (const screen of SCREENS) {
      for (const locale of BUILT_LOCALES) {
        const html = page(locale, screen);
        for (const other of BUILT_LOCALES) {
          // The link to another language points at THIS screen in it, never at
          // a home page.
          expect(html, `${screen} ${locale} to ${other}`).toContain(
            `href="${pathOf(other, screen)}"`,
          );
        }
      }
    }
  });

  it('builds every screen in every language, and nothing else', () => {
    const built = new Set(buildFiles(DATA).map((file) => file.path));
    for (const locale of BUILT_LOCALES) {
      for (const screen of SCREENS) {
        expect(built.has(`${pathOf(locale, screen).replace(/^\//, '')}index.html`)).toBe(true);
      }
    }
    expect(built.size).toBe(BUILT_LOCALES.length * SCREENS.length + 1);
  });

  it('marks where you are, once, in the sidebar', () => {
    // Rule 5 of the design system: the current location is visually marked, and
    // navigation sits in the same place on every page.
    for (const screen of SCREENS) {
      const current = [...page('ar', screen).matchAll(/aria-current="page"/g)];
      // One in the sidebar, and on the exam screen one more in the tab row,
      // which is a second level of the same location rather than a second
      // location.
      expect(current.length, screen).toBe(screen === 'exam' ? 2 : 1);
    }
  });
});

describe('a language 35 percent longer changes nothing structural', () => {
  /**
   * Every string stretched, written out field by field.
   *
   * Deliberately not a generic deep map: this project bans type assertions, and
   * a mapper that keeps the type honest costs more than listing the fields. The
   * list also fails to compile when a field is added, which is the moment
   * somebody should be asked whether the new string was tested long.
   */
  const stretch = (copy: Copy): Copy => ({
    brand: copy.brand,
    skip: pseudo(copy.skip),
    navLabel: pseudo(copy.navLabel),
    tabsLabel: pseudo(copy.tabsLabel),
    nav: {
      exams: pseudo(copy.nav.exams),
      students: pseudo(copy.nav.students),
      sheets: pseudo(copy.nav.sheets),
      settings: pseudo(copy.nav.settings),
    },
    sync: {
      label: pseudo(copy.sync.label),
      last: copy.sync.last,
      pending: pseudo(copy.sync.pending),
    },
    exams: {
      title: pseudo(copy.exams.title),
      help: pseudo(copy.exams.help),
      newExam: pseudo(copy.exams.newExam),
      columns: copy.exams.columns.map(pseudo),
      openLabel: pseudo(copy.exams.openLabel),
    },
    exam: {
      eyebrow: pseudo(copy.exam.eyebrow),
      title: pseudo(copy.exam.title),
      help: pseudo(copy.exam.help),
      scan: pseudo(copy.exam.scan),
      scanHelp: pseudo(copy.exam.scanHelp),
      tabs: copy.exam.tabs.map(pseudo),
      stats: copy.exam.stats.map((entry) => ({
        label: pseudo(entry.label),
        note: pseudo(entry.note),
      })),
      missing: pseudo(copy.exam.missing),
      papersTitle: pseudo(copy.exam.papersTitle),
      papersHelp: pseudo(copy.exam.papersHelp),
      papersColumns: copy.exam.papersColumns.map(pseudo),
      export: pseudo(copy.exam.export),
      reviewNeeded: pseudo(copy.exam.reviewNeeded),
      itemsTitle: pseudo(copy.exam.itemsTitle),
      itemsHelp: pseudo(copy.exam.itemsHelp),
      difficultyTitle: pseudo(copy.exam.difficultyTitle),
      difficultyBand: pseudo(copy.exam.difficultyBand),
      difficultySummary: pseudo(copy.exam.difficultySummary),
      distractorTitle: pseudo(copy.exam.distractorTitle),
      keyWord: pseudo(copy.exam.keyWord),
      suspectKey: pseudo(copy.exam.suspectKey),
      indicesOff: pseudo(copy.exam.indicesOff),
      tagsTitle: pseudo(copy.exam.tagsTitle),
      tagsHelp: pseudo(copy.exam.tagsHelp),
      tagsColumns: copy.exam.tagsColumns.map(pseudo),
      empty: pseudo(copy.exam.empty),
      question: copy.exam.question,
    },
    students: {
      title: pseudo(copy.students.title),
      help: pseudo(copy.students.help),
      import: pseudo(copy.students.import),
      columns: copy.students.columns.map(pseudo),
    },
    sheets: {
      title: pseudo(copy.sheets.title),
      help: pseudo(copy.sheets.help),
      make: pseudo(copy.sheets.make),
      columns: copy.sheets.columns.map(pseudo),
    },
    builder: {
      title: pseudo(copy.builder.title),
      titleHelp: pseudo(copy.builder.titleHelp),
      choicesTitle: pseudo(copy.builder.choicesTitle),
      choicesHelp: pseudo(copy.builder.choicesHelp),
      outcomeTitle: pseudo(copy.builder.outcomeTitle),
      outcomeHelp: pseudo(copy.builder.outcomeHelp),
      download: pseudo(copy.builder.download),
      missing: pseudo(copy.builder.missing),
      rowsDefault: pseudo(copy.builder.rowsDefault),
      rowsDense: pseudo(copy.builder.rowsDense),
      keyVersionCost: pseudo(copy.builder.keyVersionCost),
      fields: {
        name: pseudo(copy.builder.fields.name),
        questions: pseudo(copy.builder.fields.questions),
        choices: pseudo(copy.builder.fields.choices),
        alphabet: pseudo(copy.builder.fields.alphabet),
        placement: pseudo(copy.builder.fields.placement),
        select: pseudo(copy.builder.fields.select),
        studentId: pseudo(copy.builder.fields.studentId),
        keyVersions: pseudo(copy.builder.fields.keyVersions),
        family: pseudo(copy.builder.fields.family),
      },
      help: {
        name: pseudo(copy.builder.help.name),
        questions: pseudo(copy.builder.help.questions),
        choices: pseudo(copy.builder.help.choices),
        alphabet: pseudo(copy.builder.help.alphabet),
        placement: pseudo(copy.builder.help.placement),
        select: pseudo(copy.builder.help.select),
        studentId: pseudo(copy.builder.help.studentId),
        keyVersions: pseudo(copy.builder.help.keyVersions),
        family: pseudo(copy.builder.help.family),
      },
      alphabets: {
        latin: pseudo(copy.builder.alphabets.latin),
        arabic: pseudo(copy.builder.alphabets.arabic),
        digits: pseudo(copy.builder.alphabets.digits),
        trueFalse: pseudo(copy.builder.alphabets.trueFalse),
      },
      placements: {
        internal: pseudo(copy.builder.placements.internal),
        header: pseudo(copy.builder.placements.header),
        external: pseudo(copy.builder.placements.external),
      },
      selects: {
        one: pseudo(copy.builder.selects.one),
        many: pseudo(copy.builder.selects.many),
      },
      families: {
        A: pseudo(copy.builder.families.A),
        LETTER: pseudo(copy.builder.families.LETTER),
      },
      stats: {
        paper: pseudo(copy.builder.stats.paper),
        questions: pseudo(copy.builder.stats.questions),
        fill: pseudo(copy.builder.stats.fill),
        rows: pseudo(copy.builder.stats.rows),
      },
      statNotes: {
        paper: pseudo(copy.builder.statNotes.paper),
        questions: pseudo(copy.builder.statNotes.questions),
        fill: pseudo(copy.builder.statNotes.fill),
        rows: pseudo(copy.builder.statNotes.rows),
      },
      refusals: {
        doesNotFit: pseudo(copy.builder.refusals.doesNotFit),
        other: pseudo(copy.builder.refusals.other),
      },
    },
    settings: {
      title: pseudo(copy.settings.title),
      help: pseudo(copy.settings.help),
      language: pseudo(copy.settings.language),
      languageHelp: pseudo(copy.settings.languageHelp),
    },
  });

  it('lengthens every string it is given', () => {
    expect(pseudo('Exams').length).toBeGreaterThan('Exams'.length);
    expect(pseudo('')).toBe('');
  });

  it('leaves the structure of every screen untouched', () => {
    const english = COPY['en'];
    const long = english === undefined ? undefined : stretch(english);
    expect(long).toBeDefined();
    if (long === undefined) return;
    for (const screen of SCREENS) {
      expect(skeleton(page('en', screen, long)), screen).toEqual(skeleton(page('en', screen)));
    }
  });
});

describe('the shapes a translation cannot change', () => {
  it('keeps every column list the same length in every language', () => {
    // A table with six headers in one language and seven in another is a broken
    // grid, and it is the single most likely way a translation breaks a layout.
    const lengths = (copy: Copy): number[] => [
      copy.exams.columns.length,
      copy.exam.papersColumns.length,
      copy.exam.tagsColumns.length,
      copy.exam.tabs.length,
      copy.exam.stats.length,
      copy.students.columns.length,
      copy.sheets.columns.length,
    ];
    const first = COPY[BUILT_LOCALES[0] ?? ''];
    expect(first).toBeDefined();
    if (first === undefined) return;
    for (const locale of BUILT_LOCALES) {
      const copy = COPY[locale];
      expect(copy, locale).toBeDefined();
      if (copy !== undefined) expect(lengths(copy), locale).toEqual(lengths(first));
    }
  });

  it('leaves no string empty in any language', () => {
    // A missing translation renders as a gap the layout was never designed
    // around, and it is silent. Here it is loud.
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') expect(value.trim(), path).not.toBe('');
      else if (Array.isArray(value))
        value.forEach((entry, at) => {
          walk(entry, `${path}[${String(at)}]`);
        });
      else if (typeof value === 'object' && value !== null) {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
      }
    };
    for (const locale of BUILT_LOCALES) walk(COPY[locale], locale);
  });
});
