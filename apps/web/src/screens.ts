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
//
// The exam detail lives in `exam-screen.ts`. It is the only one carrying four
// sections at once, and together with these four it made a file past the three
// hundred line limit in docs/CODING-STANDARDS.md.
//
// The data arrives as a `Dashboard` parameter rather than being fetched here.
// The screens used to import a module that held the class as constants; they
// now render whatever rows they are handed, which is what let the source become
// a database without a single change to the markup.

import { button, esc, ltr, screenHeader, section, table } from '@transferchecker/ui';
import type { Column } from '@transferchecker/ui';
import type { Copy } from './copy';
import type { Dashboard } from './data';
import { examScreen } from './exam-screen';
import { pathOf } from './routes';
import type { Screen } from './routes';

export { SCREENS, pathOf } from './routes';
export type { Screen } from './routes';

function examsScreen(copy: Copy, locale: string, data: Dashboard): string {
  const state = data.summary;
  const columns: Column[] = copy.exams.columns.map((label, at) => ({
    key: String(at),
    label,
    numeric: at >= 2 && at <= 4,
    ...(at === 5 ? { sorted: 'descending' as const } : {}),
  }));
  const rows = [
    [
      // The exam's own title, as the teacher typed it. It is not translated and
      // must not be: an exam is one thing with one name in every language.
      `<a href="${pathOf(locale, 'exam')}">${esc(data.exam.title)}</a>`,
      esc('3 / أ'),
      ltr(String(data.key.questions.length)),
      ltr(String(state.papers)),
      ltr(String(state.needsReview)),
      ltr(data.exam.createdAt),
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

function studentsScreen(copy: Copy, data: Dashboard): string {
  // An unmatched paper counts for nobody, which is the honest answer until a
  // teacher says whose it is.
  const counts = new Map<string, number>();
  for (const paper of data.papers) {
    if (paper.student !== null)
      counts.set(paper.student.id, (counts.get(paper.student.id) ?? 0) + 1);
  }
  const columns: Column[] = copy.students.columns.map((label, at) => ({
    key: String(at),
    label,
    numeric: at >= 1,
  }));
  const rows = data.roster.map((student) => [
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
  data: Dashboard,
): string {
  switch (name) {
    case 'exams':
      return examsScreen(copy, locale, data);
    case 'exam':
      return examScreen(copy, locale, data);
    case 'students':
      return studentsScreen(copy, data);
    case 'sheets':
      return sheetsScreen(copy);
    case 'settings':
      return settingsScreen(copy, locale, locales);
  }
}
