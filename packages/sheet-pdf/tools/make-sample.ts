// Compiles sample sheets to PDF and SVG so the geometry and the Arabic
// shaping can be checked with a ruler and with eyes.
//
// Usage: tsx tools/make-sample.ts <out-dir> [font-dir]

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import {
  DEFAULT_BUBBLE,
  SheetSpecSchema,
  arabicSymbols,
  digitSymbols,
  latinSymbols,
  layoutSheet,
} from '@transferchecker/sheet-spec';
import type { SheetSpecInput } from '@transferchecker/sheet-spec';
import { renderSheetTypst } from '../src/index';

const OUT_DIR = resolve(process.cwd(), process.argv[2] ?? '../../docs/samples');
const FONT_DIR = process.argv[3];

const TEMPLATE_ID = '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90';
const WARNING_EN = 'Print at 100% scale. Do not use Fit to page.';
const WARNING_AR = 'اطبع بمقياس 100٪. لا تستخدم خيار ملاءمة الصفحة.';

const choiceRows = (
  count: number,
  symbols: readonly string[],
  placement: 'internal' | 'external' = 'internal',
): SheetSpecInput['questions'] =>
  Array.from({ length: count }, () => ({ kind: 'choice', symbols: [...symbols], placement }));

const english: SheetSpecInput = {
  templateId: TEMPLATE_ID,
  version: 3,
  name: 'Standard 40',
  branding: 'TRANSFERCHECKER.COM',
  paper: 'A4',
  columns: 'auto',
  questions: choiceRows(40, latinSymbols(5)),
  headerFields: [
    { id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox', width: 'large' },
    { id: 'section', usage: 'class', label: 'Section', kind: 'writtenBox', width: 'medium' },
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
    { id: 'section', usage: 'class', label: 'الشعبة', kind: 'writtenBox', width: 'medium' },
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

// The third sample exists because external labels are the option a teacher
// picks for legibility, and legibility is exactly what a rendered sample is for.
const external: SheetSpecInput = {
  ...english,
  name: 'Wide 30',
  questions: choiceRows(30, latinSymbols(4), 'external'),
};

const SHEETS = [
  { name: 'sheet-en', input: english, warnings: [WARNING_EN] },
  { name: 'sheet-ar', input: arabic, warnings: [WARNING_EN, WARNING_AR] },
  { name: 'sheet-external', input: external, warnings: [WARNING_EN] },
];

const compiler = NodeCompiler.create(
  FONT_DIR === undefined ? {} : { fontArgs: [{ fontPaths: [FONT_DIR] }] },
);

mkdirSync(OUT_DIR, { recursive: true });

for (const sheet of SHEETS) {
  const spec = SheetSpecSchema.parse(sheet.input);
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') {
    throw new Error(`${sheet.name}: ${result.axis} overflow in ${result.area}`);
  }

  const source = renderSheetTypst(result.layout, {
    fonts: ['IBM Plex Sans Arabic', 'IBM Plex Sans', 'DejaVu Sans'],
    warningLines: sheet.warnings,
  });

  writeFileSync(resolve(OUT_DIR, `${sheet.name}.typ`), source, 'utf8');

  // Throws with the Typst diagnostic if the source is rejected.
  const pdf = compiler.pdf({ mainFileContent: source });
  writeFileSync(resolve(OUT_DIR, `${sheet.name}.pdf`), pdf);

  const svg = compiler.svg({ mainFileContent: source });
  if (typeof svg === 'string') {
    writeFileSync(resolve(OUT_DIR, `${sheet.name}.svg`), svg, 'utf8');
  }

  process.stdout.write(`wrote ${sheet.name} (${String(pdf.length)} bytes)\n`);
}
