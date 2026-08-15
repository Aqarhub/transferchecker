// Shared fixtures for the Typst rendering tests.

import {
  DEFAULT_BUBBLE,
  SheetSpecSchema,
  digitSymbols,
  latinSymbols,
  layoutSheet,
} from '@transferchecker/sheet-spec';
import type { SheetLayout, SheetSpecInput } from '@transferchecker/sheet-spec';
import type { RenderOptions } from '../src/index';

type QuestionInput = SheetSpecInput['questions'][number];

const TEMPLATE_ID = '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90';

/** `count` identical multiple choice questions, the common case. */
export function choiceQuestions(
  count: number,
  symbols: readonly string[] = latinSymbols(5),
  placement: 'internal' | 'header' | 'external' = 'internal',
): QuestionInput[] {
  return Array.from({ length: count }, () => ({
    kind: 'choice' as const,
    symbols: [...symbols],
    placement,
  }));
}

export function makeLayout(overrides: Partial<SheetSpecInput> = {}): SheetLayout {
  const base: SheetSpecInput = {
    templateId: TEMPLATE_ID,
    version: 3,
    name: 'Standard 40',
    branding: 'TRANSFERCHECKER.COM',
    paper: 'A4',
    columns: 2,
    questions: choiceQuestions(40),
    headerFields: [
      { id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox', width: 'large' },
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
  const result = layoutSheet(SheetSpecSchema.parse({ ...base, ...overrides }));
  if (result.kind !== 'ok') {
    throw new Error(`fixture does not fit: ${result.axis} overflow in ${result.area}`);
  }
  return result.layout;
}

export function makeOptions(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return {
    fonts: ['IBM Plex Sans Arabic', 'IBM Plex Sans'],
    warningLines: ['Print at 100% scale. Do not use Fit to page.'],
    ...overrides,
  };
}
