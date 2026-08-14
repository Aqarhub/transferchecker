// Shared fixtures for the layout tests.

import {
  DEFAULT_BUBBLE,
  SheetSpecSchema,
  arabicSymbols,
  digitSymbols,
  latinSymbols,
  layoutSheet,
} from '../src/index';
import type { SheetLayout, SheetSpec, SheetSpecInput } from '../src/index';

type QuestionInput = SheetSpecInput['questions'][number];

const TEMPLATE_ID = '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90';

/** `count` identical multiple choice questions, the common case. */
export function choiceQuestions(
  count: number,
  choices = 5,
  placement: 'internal' | 'header' | 'external' = 'internal',
): QuestionInput[] {
  return Array.from({ length: count }, () => ({
    kind: 'choice' as const,
    symbols: [...latinSymbols(choices)],
    placement,
  }));
}

/** `count` Arabic labelled questions. */
export function arabicQuestions(choices: number, count = 40): QuestionInput[] {
  return Array.from({ length: count }, () => ({
    kind: 'choice' as const,
    symbols: [...arabicSymbols(choices)],
    placement: 'internal' as const,
  }));
}

/** A sheet shaped like the reference design: 40 questions, ids, one name box. */
export function makeSpec(overrides: Partial<SheetSpecInput> = {}): SheetSpec {
  const base: SheetSpecInput = {
    templateId: TEMPLATE_ID,
    version: 3,
    name: 'Standard 40',
    branding: 'TRANSFERCHECKER.COM',
    paper: 'A4',
    columns: 'auto',
    questions: choiceQuestions(40),
    headerFields: [
      { id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox', width: 'large' },
      { id: 'class', usage: 'class', label: 'Class', kind: 'writtenBox', width: 'medium' },
      {
        id: 'studentId',
        usage: 'studentId',
        label: 'Student ID',
        kind: 'bubbleGrid',
        length: 4,
        symbols: [...digitSymbols()],
      },
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
