// The exam screen, which is the one with everything on it.
//
// Its own file because it is the only screen carrying four sections at once:
// the stat row, the papers table, the two charts, and the tag report. The other
// four are a header and a table each, and keeping them together with this makes
// one file nobody can read at a glance.
//
// Every number on it comes from the `Dashboard`, which came out of the database.
// Nothing here computes a score: `packages/grading` did that, and a second
// implementation of the scoring rules living in a view is how two answers start
// disagreeing.

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
import type { Copy } from './copy';
import type { Dashboard } from './data';
import { pathOf } from './routes';

/** What the bubbles are actually labelled on the printed sheet. */
const SYMBOLS = ['A', 'B', 'C', 'D'];

const one = (value: number): string => value.toFixed(1);
const pct = (value: number | null): string | null =>
  value === null ? null : `${(value * 100).toFixed(0)}%`;

export function examScreen(copy: Copy, locale: string, data: Dashboard): string {
  const state = data.summary;
  const all = data.papers;
  const analysis = data.items;
  const report = data.tags;

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
    // A paper whose identity grid was unreadable has no pupil yet. It is shown
    // with the same marker every other absent value uses rather than dropped.
    paper.student === null
      ? `<span class="stat-missing">${esc(copy.exam.missing)}</span>`
      : esc(paper.student.name),
    ltr(esc(paper.student?.id ?? '')),
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
  const keyed =
    worth === undefined ? null : (data.key.questions[worth.question - 1]?.intended ?? null);
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
      title: data.exam.title,
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
