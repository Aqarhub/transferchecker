// The sheet builder, the screen behind "make a sheet".
//
// Its own file for the same reason `exam-screen.ts` is: `screens.ts` was
// already near the three hundred line cap in docs/CODING-STANDARDS.md.
//
// THE OUTCOME IS NOT DESCRIBED, IT IS BUILT. Everything under the choices comes
// from a real `buildSheet` call on the values the controls are showing, so the
// paper, the fill and the refusal on this screen are the ones the engine
// actually returns. A screen that hardcoded "A4" would keep saying A4 on the
// day the layout changed, and nothing would notice.
//
// Nothing is wired to the controls yet: the dashboard is a static generator and
// every control on every screen is in that state. What exists now is the
// markup, the labelling and the layout in both directions.

import { buildSheet } from '@transferchecker/sheet-spec';
import type { BuildResult, SheetChoices } from '@transferchecker/sheet-spec';
import { button, esc, field, ltr, screenHeader, section, stat } from '@transferchecker/ui';
import type { Copy } from './copy';

/**
 * What a new sheet starts as.
 *
 * Not data from the database, and deliberately not: it is the state of an empty
 * form, which is a property of the screen. The values are the ordinary quiz,
 * because a teacher opening this should be one click from something printable
 * rather than facing an empty page.
 */
export const DEFAULT_CHOICES: SheetChoices = {
  // A fixed id here because this screen renders one example. A real sheet is
  // given its own id once, when the teacher first saves it, and keeps it: the
  // id is printed into the code on every paper.
  templateId: '0a1b2c3d-2222-4a22-9222-000000000222',
  name: 'Unit 3',
  branding: 'TRANSFERCHECKER.COM',
  questions: 40,
  choices: 4,
  alphabet: 'latin',
  placement: 'internal',
  select: 'one',
  studentId: 4,
  keyVersions: 0,
  family: 'A',
  labels: { studentName: 'Name', studentId: 'Student ID', keyVersion: 'Key' },
};

/** A percentage as a whole number, which is the only precision worth showing. */
const percent = (value: number): string => `${String(Math.round(value * 100))}%`;

function choicesPanel(copy: Copy, choices: SheetChoices): string {
  const words = copy.builder;
  const grid = [
    field({
      id: 'sheet-name',
      label: words.fields.name,
      help: words.help.name,
      control: { kind: 'text', value: choices.name, maxLength: 40 },
    }),
    field({
      id: 'sheet-questions',
      label: words.fields.questions,
      help: words.help.questions,
      control: { kind: 'number', value: choices.questions, min: 1, max: 200 },
    }),
    field({
      id: 'sheet-choices',
      label: words.fields.choices,
      help: words.help.choices,
      control: { kind: 'number', value: choices.choices, min: 2, max: 10 },
    }),
    field({
      id: 'sheet-alphabet',
      label: words.fields.alphabet,
      help: words.help.alphabet,
      control: {
        kind: 'choice',
        value: choices.alphabet,
        options: [
          { value: 'latin', label: words.alphabets.latin },
          { value: 'arabic', label: words.alphabets.arabic },
          { value: 'digits', label: words.alphabets.digits },
          { value: 'trueFalse', label: words.alphabets.trueFalse },
        ],
      },
    }),
    field({
      id: 'sheet-placement',
      label: words.fields.placement,
      help: words.help.placement,
      control: {
        kind: 'choice',
        value: choices.placement,
        options: [
          { value: 'internal', label: words.placements.internal },
          { value: 'header', label: words.placements.header },
          { value: 'external', label: words.placements.external },
        ],
      },
    }),
    field({
      id: 'sheet-select',
      label: words.fields.select,
      help: words.help.select,
      control: {
        kind: 'choice',
        value: choices.select,
        options: [
          { value: 'one', label: words.selects.one },
          { value: 'many', label: words.selects.many },
        ],
      },
    }),
    field({
      id: 'sheet-student-id',
      label: words.fields.studentId,
      help: words.help.studentId,
      control: { kind: 'number', value: choices.studentId, min: 0, max: 12 },
    }),
    field({
      id: 'sheet-key-versions',
      label: words.fields.keyVersions,
      help: words.help.keyVersions,
      // The note is a measured consequence, not advice: a key version grid
      // moves a twenty question quiz from A5 to A4.
      note: words.keyVersionCost,
      control: { kind: 'number', value: choices.keyVersions, min: 0, max: 10 },
    }),
    field({
      id: 'sheet-family',
      label: words.fields.family,
      help: words.help.family,
      control: {
        kind: 'choice',
        value: choices.family,
        options: [
          { value: 'A', label: words.families.A },
          { value: 'LETTER', label: words.families.LETTER },
        ],
      },
    }),
  ].join('\n');

  return section({
    title: words.choicesTitle,
    help: words.choicesHelp,
    helpLabel: words.choicesTitle,
    body: `<div class="field-grid">\n${grid}\n</div>`,
  });
}

/**
 * The sheet the choices produce, or the reason there is none.
 *
 * A refusal is a first class outcome here rather than an error state bolted on,
 * because asking for something that does not fit is an ordinary step on the way
 * to a sheet that does. It carries the engine's own numbers.
 */
function outcomePanel(copy: Copy, made: BuildResult): string {
  const words = copy.builder;
  if (made.kind === 'refused') {
    const reason = made.reason;
    // The millimetres go through `ltr` and the sentence does not: a measurement
    // reads left to right in every language, and the words around it must not.
    const detail =
      reason.kind === 'does-not-fit'
        ? `${esc(words.refusals.doesNotFit)} ${ltr(`${String(Math.round(reason.neededMm))}mm`)} / ${ltr(`${String(Math.round(reason.availableMm))}mm`)}`
        : esc(words.refusals.other);
    return section({
      title: words.outcomeTitle,
      help: words.outcomeHelp,
      helpLabel: words.outcomeTitle,
      body: `<p class="field-note">${detail}</p>`,
    });
  }

  // The row pitch as a NUMBER rather than the word "tightened", because `stat`
  // wraps its value in an isolated left to right run in the tabular face, which
  // is right for a measurement and wrong for an Arabic word. The word belongs in
  // the note underneath, which is plain text. And the millimetres are the more
  // useful answer anyway: they say how much tighter.
  const strip = `<div class="stats">
${stat(words.stats.paper, made.paper, words.statNotes.paper, words.missing)}
${stat(words.stats.questions, String(made.spec.questions.length), words.statNotes.questions, words.missing)}
${stat(words.stats.fill, percent(made.fill), words.statNotes.fill, words.missing)}
${stat(words.stats.rows, `${String(made.spec.bubble.pitchYMm)}mm`, made.rows === 'dense' ? words.rowsDense : words.rowsDefault, words.missing)}
</div>`;

  return section({
    title: words.outcomeTitle,
    help: words.outcomeHelp,
    helpLabel: words.outcomeTitle,
    action: button(words.download, 'primary', 'download'),
    body: strip,
  });
}

export function sheetScreen(copy: Copy, choices: SheetChoices = DEFAULT_CHOICES): string {
  return (
    screenHeader({
      title: copy.builder.title,
      help: copy.builder.titleHelp,
      helpLabel: copy.builder.title,
    }) +
    choicesPanel(copy, choices) +
    outcomePanel(copy, buildSheet(choices))
  );
}
