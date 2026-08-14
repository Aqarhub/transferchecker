// Shared fixtures for the Typst rendering tests.

import { DEFAULT_BUBBLE, SheetSpecSchema, layoutSheet } from '@transferchecker/sheet-spec';
import type { SheetLayout, SheetSpecInput } from '@transferchecker/sheet-spec';
import type { QrMatrix, RenderOptions } from '../src/index';

const TEMPLATE_ID = '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90';

export function makeLayout(overrides: Partial<SheetSpecInput> = {}): SheetLayout {
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
      { id: 'studentId', label: 'Student ID', kind: 'bubbleGrid', length: 4, alphabet: 'digits' },
    ],
    bubble: DEFAULT_BUBBLE,
  };
  const result = layoutSheet(SheetSpecSchema.parse({ ...base, ...overrides }));
  if (result.kind !== 'ok') {
    throw new Error(`fixture does not fit: ${result.axis} overflow in ${result.area}`);
  }
  return result.layout;
}

/** A small stand-in matrix, enough to assert module geometry. */
export function makeQr(size = 21): QrMatrix {
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => (x + y) % 3 === 0),
  );
}

export function makeOptions(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return {
    fonts: ['IBM Plex Sans Arabic', 'IBM Plex Sans'],
    warningLines: ['Print at 100% scale. Do not use Fit to page.'],
    qr: makeQr(),
    ...overrides,
  };
}
