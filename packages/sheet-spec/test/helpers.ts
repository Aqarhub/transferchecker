// Shared fixtures for the layout tests.

import { DEFAULT_BUBBLE, SheetSpecSchema, layoutSheet } from '../src/index';
import type { SheetLayout, SheetSpec, SheetSpecInput } from '../src/index';

const TEMPLATE_ID = '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90';

/** A sheet shaped like the reference design: 40 questions, two columns, ids. */
export function makeSpec(overrides: Partial<SheetSpecInput> = {}): SheetSpec {
  const base: SheetSpecInput = {
    templateId: TEMPLATE_ID,
    version: 2,
    paper: 'A4',
    questions: 40,
    choices: 5,
    columns: 2,
    choiceLabels: 'latin',
    branding: 'TRANSFERCHECKER.COM',
    title: 'Final Exam (2614)',
    formCode: 'A',
    headerFields: [
      { id: 'name', label: 'Name', kind: 'writtenBox', widthMm: 72 },
      { id: 'section', label: 'Section', kind: 'writtenBox', widthMm: 46 },
      { id: 'score', label: 'Score', kind: 'writtenBox', widthMm: 50 },
      { id: 'studentId', label: 'Student ID', kind: 'bubbleGrid', length: 4, alphabet: 'digits' },
    ],
    bubble: DEFAULT_BUBBLE,
  };
  return SheetSpecSchema.parse({ ...base, ...overrides });
}

/** Unwraps a layout result, failing loudly when a fixture does not fit. */
export function layoutOrThrow(spec: SheetSpec): SheetLayout {
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') {
    throw new Error(`expected a fitting layout, got ${result.axis} overflow in ${result.area}`);
  }
  return result.layout;
}

/** Every bubble on the sheet, questions and grid fields alike. */
export function allBubbles(layout: SheetLayout) {
  return [
    ...layout.questionColumns.flatMap((column) => column.rows.flatMap((row) => row.bubbles)),
    ...layout.gridFields.flatMap((field) => field.columns.flatMap((column) => column.bubbles)),
  ];
}
