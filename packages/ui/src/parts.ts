// The primitives, and the design system rule each one exists to keep.
//
// Nothing here is a generic card component. Every part carries a constraint
// from docs/DESIGN-SYSTEM.md that a generic one would quietly break: the help
// marker beside every control (rule 10), circles reserved for bubbles (rule 1),
// the three result colours never leaving a result (rule 2), tabular figures on
// every number (rule 3), no invented value in place of a missing one (rule 17).

import { icon } from './icons';
import { ltr } from './locale';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(text: string): string {
  return text.replaceAll(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

let marker = 0;

/**
 * The question mark beside a control. Design system rule 10, and mandatory.
 *
 * A real `<button>`, reachable by keyboard, described by `aria-describedby`,
 * opening on click and not on hover alone. One sentence in the imperative,
 * saying what the thing does: not why it is useful, and not marketing.
 */
export function help(text: string, label: string): string {
  marker += 1;
  const id = `help-${String(marker)}`;
  return `<span class="help"><button type="button" class="help-dot" aria-label="${esc(label)}" aria-describedby="${id}">؟</button><span role="tooltip" id="${id}" class="help-body">${esc(text)}</span></span>`;
}

/** Resets the marker counter, so a build is byte identical run to run. */
export function resetHelpIds(): void {
  marker = 0;
}

export interface SectionOptions {
  readonly title: string;
  readonly help: string;
  readonly helpLabel: string;
  readonly action?: string;
  readonly body: string;
}

export function section(options: SectionOptions): string {
  const action = options.action ?? '';
  return `<section class="panel">
<div class="panel-head"><h2>${esc(options.title)}${help(options.help, options.helpLabel)}</h2>${action}</div>
${options.body}
</section>`;
}

export type Emphasis = 'primary' | 'quiet' | 'danger';

/**
 * A button.
 *
 * One primary per screen (rule 9), and the danger variant uses the warning
 * colour rather than the result red, because `--wrong` means a student got a
 * question wrong and must never mean "this control deletes something".
 */
export function button(text: string, emphasis: Emphasis = 'quiet', glyph?: string): string {
  const art = glyph === undefined ? '' : icon(glyph);
  return `<button type="button" class="btn btn-${emphasis}">${art}<span>${esc(text)}</span></button>`;
}

/**
 * One number in the metric strip.
 *
 * A missing value renders as its own word in the review colour, never as a
 * zero and never as a dash that looks like data (rule 17).
 */
export function stat(label: string, value: string | null, note: string, missing: string): string {
  const shown =
    value === null
      ? `<span class="stat-missing">${esc(missing)}</span>`
      : `<span class="stat-value">${ltr(esc(value))}</span>`;
  return `<div class="stat"><p class="stat-label">${esc(label)}</p>${shown}<p class="stat-note">${esc(note)}</p></div>`;
}

export type Outcome = 'correct' | 'wrong' | 'review' | 'blank';

/**
 * An answer bubble, and the only circle in the entire interface (rule 1).
 *
 * Colour is never the only carrier: each outcome also has a shape inside it,
 * so the sheet is readable by someone who cannot separate red from green,
 * which is eight percent of men.
 */
export function bubble(symbol: string, outcome: Outcome): string {
  const mark =
    outcome === 'correct'
      ? '<span class="bubble-mark" aria-hidden="true">&#10003;</span>'
      : outcome === 'wrong'
        ? '<span class="bubble-mark" aria-hidden="true">&times;</span>'
        : outcome === 'review'
          ? '<span class="bubble-mark" aria-hidden="true">?</span>'
          : '';
  return `<span class="bubble bubble-${outcome}">${esc(symbol)}${mark}</span>`;
}

/**
 * Defense د20's one character per question, as the teacher sees it.
 *
 * Monospaced and in a left to right run, because it is a record to be read
 * position by position and the paragraph direction must not touch it.
 */
export function marksStrip(marks: string): string {
  // One position per question, indexed rather than iterated. Defense د20's
  // alphabet is six ASCII characters wide by construction, so the record is a
  // string of code units and reading it as Unicode text would be a category
  // mistake: position 12 is question 12 whatever the character happens to be.
  const cells = Array.from({ length: marks.length }, (_, at) => {
    const char = marks[at] ?? '';
    return `<span class="mark mark-${esc(char)}" title="${String(at + 1)}">${esc(char)}</span>`;
  }).join('');
  return `<div class="marks" dir="ltr">${cells}</div>`;
}

export interface Column {
  readonly key: string;
  readonly label: string;
  /** Numeric columns are monospaced, tabular and never reordered by direction. */
  readonly numeric?: boolean;
  readonly sorted?: 'ascending' | 'descending';
}

/**
 * The data table, at the density a dashboard is actually read at.
 *
 * 36 pixel rows and almost no chrome, which is the density the best of this
 * class ship at, and it works because separation comes from the surface pair
 * rather than from a border on every cell (rule 5). Sorting state is announced
 * with `aria-sort`, since a caret that only exists visually is a sort order
 * nobody using a screen reader can read.
 */
export function table(
  columns: readonly Column[],
  rows: readonly (readonly string[])[],
  caption: string,
): string {
  const head = columns
    .map((column) => {
      const sort = column.sorted === undefined ? '' : ` aria-sort="${column.sorted}"`;
      return `<th scope="col"${sort} class="${column.numeric === true ? 'num-col' : ''}">${esc(column.label)}</th>`;
    })
    .join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, at) => {
            const column = columns[at];
            const numeric = column?.numeric === true;
            return at === 0
              ? `<th scope="row">${cell}</th>`
              : `<td class="${numeric ? 'num-col' : ''}">${cell}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table><caption class="sr-only">${esc(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
