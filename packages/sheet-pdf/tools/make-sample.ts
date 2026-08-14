// Compiles sample sheets to PDF and SVG so the geometry and the Arabic
// shaping can be checked with a ruler and with eyes.
//
// Usage: tsx tools/make-sample.ts <out-dir> [font-dir]

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { DEFAULT_BUBBLE, SheetSpecSchema, layoutSheet } from '@transferchecker/sheet-spec';
import type { SheetSpecInput } from '@transferchecker/sheet-spec';
import { encodeSheetQr, renderSheetTypst } from '../src/index';

const OUT_DIR = resolve(process.cwd(), process.argv[2] ?? '../../docs/samples');
const FONT_DIR = process.argv[3];

const TEMPLATE_ID = '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90';
const WARNING_EN = 'Print at 100% scale. Do not use Fit to page.';
const WARNING_AR = 'اطبع بمقياس 100٪. لا تستخدم خيار ملاءمة الصفحة.';

const english: SheetSpecInput = {
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

const arabic: SheetSpecInput = {
  ...english,
  choices: 4,
  choiceLabels: 'arabic',
  title: 'اختبار نهائي، رياضيات',
  headerFields: [
    { id: 'name', label: 'اسم الطالب', kind: 'writtenBox', widthMm: 72 },
    { id: 'section', label: 'الشعبة', kind: 'writtenBox', widthMm: 46 },
    { id: 'score', label: 'الدرجة', kind: 'writtenBox', widthMm: 50 },
    { id: 'studentId', label: 'رقم الطالب', kind: 'bubbleGrid', length: 4, alphabet: 'digits' },
  ],
};

const SHEETS = [
  { name: 'sheet-en', input: english, warnings: [WARNING_EN] },
  { name: 'sheet-ar', input: arabic, warnings: [WARNING_EN, WARNING_AR] },
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
    qr: encodeSheetQr({
      templateId: spec.templateId,
      version: spec.version,
      formCode: spec.formCode,
    }),
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
