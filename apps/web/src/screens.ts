// The five screens, and the one shape they share.
//
// List to detail with tabs, which is what the products this class is judged
// against all settled on, and which is also design system rule 16: everything
// an exam can do lives in the exam's own screen and appears nowhere else. The
// sidebar has four destinations and one level, so nothing is ever two clicks
// deep for no reason.
//
// Every screen is built the same way in every language from the same call, so
// there is no branch a translation can take that the layout has not seen.

import {
  barChart,
  bubble,
  button,
  distractorChart,
  esc,
  ltr,
  marksStrip,
  screenHeader,
  section,
  stat,
  table,
  tabs,
} from '@transferchecker/ui';
import type { Column } from '@transferchecker/ui';
import { KEY, items, papers, roster, summary, tags } from './data';
import type { Copy } from './copy';

/** What the bubbles are actually labelled on the printed sheet. */
const SYMBOLS = ['A', 'B', 'C', 'D'];

const one = (value: number): string => value.toFixed(1);
const pct = (value: number | null): string | null =>
  value === null ? null : `${(value * 100).toFixed(0)}%`;

export const SCREENS = ['exams', 'exam', 'students', 'sheets', 'settings'] as const;
export type Screen = (typeof SCREENS)[number];

export function pathOf(locale: string, screen: Screen): string {
  return screen === 'exams' ? `/${locale}/` : `/${locale}/${screen}/`;
}

function examsScreen(copy: Copy, locale: string): string {
  const state = summary();
  const columns: Column[] = copy.exams.columns.map((label, at) => ({
    key: String(at),
    label,
    numeric: at >= 2 && at <= 4,
    ...(at === 5 ? { sorted: 'descending' as const } : {}),
  }));
  const rows = [
    [
      `<a href="${pathOf(locale, 'exam')}">${esc(copy.exam.title)}</a>`,
      esc('3 / أ'),
      ltr(String(KEY.questions.length)),
      ltr(String(state.papers)),
      ltr(String(state.needsReview)),
      ltr('2026-08-15'),
    ],
  ];
  return (
    screenHeader({
      title: copy.exams.title,
      help: copy.exams.help,
      helpLabel: copy.exams.title,
      action: button(copy.exams.newExam, 'primary', 'plus'),
    }) +
    section({
      title: copy.exams.title,
      help: copy.exams.help,
      helpLabel: copy.exams.title,
      body: table(columns, rows, copy.exams.title),
    })
  );
}

function examScreen(copy: Copy, locale: string): string {
  const state = summary();
  const all = papers();
  const analysis = items();
  const report = tags();

  const stats = `<div class="stats">
${stat(copy.exam.stats[0]?.label ?? '', String(state.papers), copy.exam.stats[0]?.note ?? '', copy.exam.missing)}
${stat(copy.exam.stats[1]?.label ?? '', state.mean === null ? null : `${one(state.mean)} / ${one(state.total)}`, copy.exam.stats[1]?.note ?? '', copy.exam.missing)}
${stat(copy.exam.stats[2]?.label ?? '', String(state.needsReview), copy.exam.stats[2]?.note ?? '', copy.exam.missing)}
${stat(copy.exam.stats[3]?.label ?? '', String(state.unresolved), copy.exam.stats[3]?.note ?? '', copy.exam.missing)}
</div>`;

  const tabRow = tabs(
    copy.exam.tabs.map((label, at) => ({
      href: `${pathOf(locale, 'exam')}#tab-${String(at)}`,
      label,
      current: at === 2,
    })),
    copy.tabsLabel,
  );

  const paperColumns: Column[] = copy.exam.papersColumns.map((label, at) => ({
    key: String(at),
    label,
    numeric: at >= 1 && at <= 4,
  }));
  const paperRows = all.map((paper) => [
    esc(paper.student.name),
    ltr(esc(paper.student.id)),
    ltr(`${one(paper.grade.score)} / ${one(paper.grade.total)}`),
    ltr(String(paper.grade.blanks)),
    paper.grade.needsReview
      ? `${bubble('!', 'review')}<span class="sr-only">${esc(copy.exam.reviewNeeded)}</span>`
      : bubble('', 'blank'),
    ltr(paper.scannedAt),
    marksStrip(paper.marks),
  ]);

  // Ordered easiest to hardest, which is how a teacher reads it: the bottom of
  // this chart is the list of questions to look at again.
  const difficulty = [...analysis.items]
    .filter((item) => item.difficulty !== null)
    .sort((left, right) => (right.difficulty ?? 0) - (left.difficulty ?? 0));

  const chart = barChart({
    title: copy.exam.difficultyTitle,
    summary: copy.exam.difficultySummary,
    empty: copy.exam.empty,
    band: { from: 0.4, to: 0.8, label: copy.exam.difficultyBand },
    bars: difficulty.map((item) => ({
      label: `${copy.exam.question}${String(item.question)}`,
      value: item.difficulty ?? 0,
      note: pct(item.difficulty) ?? '',
      flagged: item.suspectKey,
    })),
  });

  // The question worth opening: the one whose key looks wrong if there is one,
  // otherwise the hardest. A distractor chart of a question everybody answered
  // the same way is a single bar and tells a teacher nothing.
  const worth =
    analysis.items.find((item) => item.suspectKey) ??
    [...analysis.items]
      .filter((item) => item.difficulty !== null)
      .sort((left, right) => (left.difficulty ?? 1) - (right.difficulty ?? 1))[0];
  const keyed = worth === undefined ? null : (KEY.questions[worth.question - 1]?.intended ?? null);
  const distractors =
    worth === undefined
      ? ''
      : distractorChart(
          `${copy.exam.distractorTitle} ${copy.exam.question}${String(worth.question)}`,
          // Every option, including the ones nobody chose: a zero is a finding.
          [0, 1, 2, 3].map((index) => ({
            symbol: SYMBOLS[index] ?? String(index),
            chosen: worth.options.find((option) => option.index === index)?.chosen ?? 0,
            keyed: Array.isArray(keyed) ? keyed.includes(index) : keyed === index,
          })),
          copy.exam.keyWord,
          copy.exam.empty,
        );

  const tagColumns: Column[] = copy.exam.tagsColumns.map((label, at) => ({
    key: String(at),
    label,
    numeric: at >= 1,
  }));
  const tagRows = report.overall.map((entry) => [
    esc(entry.tag),
    ltr(String(entry.questions.length)),
    entry.share === null
      ? `<span class="stat-missing">${esc(copy.exam.missing)}</span>`
      : ltr(pct(entry.share) ?? ''),
    ltr(String(entry.unresolved)),
  ]);

  return (
    screenHeader({
      eyebrow: copy.exam.eyebrow,
      title: copy.exam.title,
      help: copy.exam.help,
      helpLabel: copy.exam.title,
      action: button(copy.exam.scan, 'primary', 'scan'),
      stats,
      tabs: tabRow,
    }) +
    section({
      title: copy.exam.papersTitle,
      help: copy.exam.papersHelp,
      helpLabel: copy.exam.papersTitle,
      action: button(copy.exam.export, 'quiet', 'download'),
      body: table(paperColumns, paperRows, copy.exam.papersTitle),
    }) +
    section({
      title: copy.exam.itemsTitle,
      help: copy.exam.itemsHelp,
      helpLabel: copy.exam.itemsTitle,
      body: `<div class="grid-2">${chart}${distractors}</div><p class="chart-empty">${esc(copy.exam.indicesOff)}</p>`,
    }) +
    section({
      title: copy.exam.tagsTitle,
      help: copy.exam.tagsHelp,
      helpLabel: copy.exam.tagsTitle,
      body: table(tagColumns, tagRows, copy.exam.tagsTitle),
    })
  );
}

function studentsScreen(copy: Copy): string {
  const counts = new Map(papers().map((paper) => [paper.student.id, 1]));
  const columns: Column[] = copy.students.columns.map((label, at) => ({
    key: String(at),
    label,
    numeric: at >= 1,
  }));
  const rows = roster().map((student) => [
    esc(student.name),
    ltr(esc(student.id)),
    ltr(String(counts.get(student.id) ?? 0)),
  ]);
  return (
    screenHeader({
      title: copy.students.title,
      help: copy.students.help,
      helpLabel: copy.students.title,
      action: button(copy.students.import, 'primary', 'plus'),
    }) +
    section({
      title: copy.students.title,
      help: copy.students.help,
      helpLabel: copy.students.title,
      body: table(columns, rows, copy.students.title),
    })
  );
}

function sheetsScreen(copy: Copy): string {
  const columns: Column[] = copy.sheets.columns.map((label, at) => ({
    key: String(at),
    label,
    numeric: at >= 1 && at <= 2,
  }));
  const rows = [
    [esc('quick20'), ltr('20'), ltr('4'), ltr('A5')],
    [esc('standard50'), ltr('50'), ltr('5'), ltr('A4')],
    [esc('full100'), ltr('100'), ltr('5'), ltr('A4')],
  ];
  return (
    screenHeader({
      title: copy.sheets.title,
      help: copy.sheets.help,
      helpLabel: copy.sheets.title,
      action: button(copy.sheets.make, 'primary', 'plus'),
    }) +
    section({
      title: copy.sheets.title,
      help: copy.sheets.help,
      helpLabel: copy.sheets.title,
      body: table(columns, rows, copy.sheets.title),
    })
  );
}

function settingsScreen(
  copy: Copy,
  locale: string,
  locales: readonly { code: string; name: string }[],
): string {
  const options = locales
    .map(
      (entry) =>
        `<li><a href="${pathOf(entry.code, 'settings')}" hreflang="${entry.code}" lang="${entry.code}"${entry.code === locale ? ' aria-current="true"' : ''}>${esc(entry.name)}</a></li>`,
    )
    .join('');
  return (
    screenHeader({
      title: copy.settings.title,
      help: copy.settings.help,
      helpLabel: copy.settings.title,
    }) +
    section({
      title: copy.settings.language,
      help: copy.settings.languageHelp,
      helpLabel: copy.settings.language,
      body: `<ul class="langs">${options}</ul>`,
    })
  );
}

export function screen(
  name: Screen,
  copy: Copy,
  locale: string,
  locales: readonly { code: string; name: string }[],
): string {
  switch (name) {
    case 'exams':
      return examsScreen(copy, locale);
    case 'exam':
      return examScreen(copy, locale);
    case 'students':
      return studentsScreen(copy);
    case 'sheets':
      return sheetsScreen(copy);
    case 'settings':
      return settingsScreen(copy, locale, locales);
  }
}
