// Regenerates the design mockups in docs/mockups from the real layout engine,
// so the reviewed drawings can never drift from the code that produces sheets.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  DEFAULT_BUBBLE,
  SheetSpecSchema,
  arabicSymbols,
  digitSymbols,
  latinSymbols,
  layoutSheet,
} from '../src/index';
import type { SheetSpecInput } from '../src/index';
import { renderSheetSvg } from './render-svg';

// Taken from the command line rather than from import.meta.url, which would
// point at the bundle instead of this source file when the tool is compiled.
const OUT_DIR = resolve(process.cwd(), process.argv[2] ?? '../../docs/mockups');

const TEMPLATE_ID = '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90';
const PRINT_WARNING_EN = 'Print at 100% scale. Do not use Fit to page.';
const PRINT_WARNING_AR = 'اطبع بمقياس 100٪. لا تستخدم خيار ملاءمة الصفحة.';

const choiceRows = (
  count: number,
  symbols: readonly string[],
  placement: 'internal' | 'external' = 'internal',
): SheetSpecInput['questions'] =>
  Array.from({ length: count }, () => ({ kind: 'choice', symbols: [...symbols], placement }));

const english: SheetSpecInput = {
  templateId: TEMPLATE_ID,
  version: 4,
  name: 'Standard 40',
  branding: 'TRANSFERCHECKER.COM',
  paper: 'A4',
  columns: 'auto',
  questions: choiceRows(40, latinSymbols(5)),
  headerFields: [
    { id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox', width: 'large' },
    { id: 'class', usage: 'class', label: 'Class', kind: 'writtenBox', width: 'medium' },
    { id: 'score', usage: 'score', label: 'Score', kind: 'writtenBox', width: 'medium' },
    {
      id: 'studentId',
      usage: 'studentId',
      label: 'Student ID',
      kind: 'bubbleGrid',
      length: 4,
      symbols: [...digitSymbols()],
    },
    {
      id: 'key',
      usage: 'keyVersion',
      label: 'Key',
      kind: 'bubbleGrid',
      length: 1,
      symbols: ['A', 'B', 'C', 'D'],
    },
  ],
  bubble: DEFAULT_BUBBLE,
};

// Same structure, customised the way an Arabic speaking teacher would: Arabic
// labels and choice letters, while numbers and the grid direction stay English.
const arabic: SheetSpecInput = {
  ...english,
  name: 'نموذج قياسي 40',
  questions: choiceRows(40, arabicSymbols(4)),
  headerFields: [
    { id: 'name', usage: 'studentName', label: 'اسم الطالب', kind: 'writtenBox', width: 'large' },
    { id: 'class', usage: 'class', label: 'الشعبة', kind: 'writtenBox', width: 'medium' },
    { id: 'score', usage: 'score', label: 'الدرجة', kind: 'writtenBox', width: 'medium' },
    {
      id: 'studentId',
      usage: 'studentId',
      label: 'رقم الطالب',
      kind: 'bubbleGrid',
      length: 4,
      symbols: [...digitSymbols()],
    },
    {
      id: 'key',
      usage: 'keyVersion',
      label: 'النموذج',
      kind: 'bubbleGrid',
      length: 1,
      symbols: ['A', 'B', 'C', 'D'],
    },
  ],
};

// The letters sit beside the bubbles here rather than inside them. That is the
// trade a teacher makes for legibility, and it is only reviewable if drawn.
const external: SheetSpecInput = {
  ...english,
  name: 'Wide 30',
  questions: choiceRows(30, latinSymbols(4), 'external'),
};

const SHEETS = [
  { name: 'sheet-mockup-en.svg', input: english, warnings: [PRINT_WARNING_EN] },
  { name: 'sheet-mockup-ar.svg', input: arabic, warnings: [PRINT_WARNING_EN, PRINT_WARNING_AR] },
  { name: 'sheet-mockup-external.svg', input: external, warnings: [PRINT_WARNING_EN] },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const sheet of SHEETS) {
  const result = layoutSheet(SheetSpecSchema.parse(sheet.input));
  if (result.kind !== 'ok') {
    throw new Error(`${sheet.name}: ${result.axis} overflow in ${result.area}`);
  }
  const svg = renderSheetSvg(result.layout, { warningLines: sheet.warnings });
  writeFileSync(resolve(OUT_DIR, sheet.name), `${svg}\n`, 'utf8');
  process.stdout.write(`wrote ${sheet.name}\n`);
}
