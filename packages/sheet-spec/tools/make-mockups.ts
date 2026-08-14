// Regenerates the design mockups in docs/mockups from the real layout engine,
// so the reviewed drawings can never drift from the code that produces sheets.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_BUBBLE, SheetSpecSchema, layoutSheet } from '../src/index';
import type { SheetSpecInput } from '../src/index';
import { renderSheetSvg } from './render-svg';

// Taken from the command line rather than from import.meta.url, which would
// point at the bundle instead of this source file when the tool is compiled.
const OUT_DIR = resolve(process.cwd(), process.argv[2] ?? '../../docs/mockups');

const PRINT_WARNING_EN = 'Print at 100% scale. Do not use Fit to page.';
const PRINT_WARNING_AR = 'اطبع بمقياس 100٪. لا تستخدم خيار ملاءمة الصفحة.';

const english: SheetSpecInput = {
  templateId: '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90',
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

// Same structure, customised the way an Arabic speaking teacher would: Arabic
// labels and choice letters, while numbers and the grid direction stay English.
const arabic: SheetSpecInput = {
  ...english,
  choices: 4,
  choiceLabels: 'arabic',
  title: 'اختبار نهائي (2614)',
  headerFields: [
    { id: 'name', label: 'اسم الطالب', kind: 'writtenBox', widthMm: 72 },
    { id: 'section', label: 'الشعبة', kind: 'writtenBox', widthMm: 46 },
    { id: 'score', label: 'الدرجة', kind: 'writtenBox', widthMm: 50 },
    { id: 'studentId', label: 'رقم الطالب', kind: 'bubbleGrid', length: 4, alphabet: 'digits' },
  ],
};

const SHEETS = [
  { name: 'sheet-mockup-en.svg', input: english, warnings: [PRINT_WARNING_EN] },
  { name: 'sheet-mockup-ar.svg', input: arabic, warnings: [PRINT_WARNING_EN, PRINT_WARNING_AR] },
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
