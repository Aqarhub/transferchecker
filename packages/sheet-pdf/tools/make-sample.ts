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
  stockTemplate,
} from '@transferchecker/sheet-spec';
import type { SheetSpec, SheetSpecInput } from '@transferchecker/sheet-spec';
import { planPage, renderSheetTypst, themeFor, withPhysicalSize } from '../src/index';
import type { CopiesPerPage, Darkness } from '../src/index';

interface Sample {
  readonly name: string;
  /** One of these two. A stock template arrives already parsed. */
  readonly input?: SheetSpecInput;
  readonly spec?: SheetSpec;
  readonly warnings: readonly string[];
  readonly copies?: CopiesPerPage;
  readonly darkness?: Darkness;
}

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
  version: 5,
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

// A half page sheet, laid two to a page. It is designed at half page size
// rather than scaled down, because a scaled sheet has scaled bubbles and the
// scanner measures in millimetres.
const half: SheetSpecInput = {
  ...english,
  name: 'Half 20',
  paper: 'A5',
  // Four choices, not five: with an id grid a half page holds 36 of these and
  // only 18 of the wider kind.
  questions: choiceRows(20, latinSymbols(4)),
  headerFields: [
    { id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox', width: 'medium' },
    {
      id: 'studentId',
      usage: 'studentId',
      label: 'Student ID',
      kind: 'bubbleGrid',
      length: 4,
      symbols: [...digitSymbols()],
    },
  ],
};

// A quarter page carries no bubbled id grid at any question count, so this one
// identifies the student by hand.
//
// Its rows are tighter than the default. Defense د1 costs the same 16 mm of
// height on every paper size, and a quarter page has the least of it to give:
// ten rows at the default 7 mm pitch no longer fit A6. At 5.5 mm, the floor the
// schema allows and exactly `2r + 1.5` at this radius, they do.
const quarter: SheetSpecInput = {
  ...english,
  name: 'Quick 10',
  paper: 'A6',
  questions: choiceRows(10, latinSymbols(4)),
  bubble: { ...DEFAULT_BUBBLE, pitchYMm: 5.5 },
  headerFields: [
    { id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox', width: 'small' },
  ],
};

const STOCK_TEXT_EN = {
  name: 'Standard',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

const SHEETS: readonly Sample[] = [
  {
    name: 'stock-20',
    spec: stockTemplate('quick20', { ...STOCK_TEXT_EN, name: 'Quick 20' }),
    warnings: [WARNING_EN],
    copies: 2 as const,
  },
  {
    name: 'stock-50',
    spec: stockTemplate('standard50', { ...STOCK_TEXT_EN, name: 'Standard 50' }),
    warnings: [WARNING_EN],
  },
  {
    name: 'stock-100',
    spec: stockTemplate('full100', { ...STOCK_TEXT_EN, name: 'Full 100' }),
    warnings: [WARNING_EN],
  },
  {
    name: 'stock-50-ar',
    spec: stockTemplate('standard50', {
      name: 'نموذج قياسي 50',
      branding: 'TRANSFERCHECKER.COM',
      studentName: 'اسم الطالب',
      studentId: 'رقم الطالب',
      keyVersion: 'النموذج',
      // The Arabic sheet reads from the right, so its name box starts there.
      direction: 'rtl',
    }),
    warnings: [WARNING_EN, WARNING_AR],
  },
  { name: 'sheet-en', input: english, warnings: [WARNING_EN] },
  { name: 'sheet-ar', input: arabic, warnings: [WARNING_EN, WARNING_AR] },
  { name: 'sheet-external', input: external, warnings: [WARNING_EN] },
  { name: 'sheet-2up', input: half, warnings: [WARNING_EN], copies: 2 as const },
  { name: 'sheet-4up', input: quarter, warnings: [WARNING_EN], copies: 4 as const },
  { name: 'sheet-dark', input: english, warnings: [WARNING_EN], darkness: 'dark' as const },
];

const compiler = NodeCompiler.create(
  FONT_DIR === undefined ? {} : { fontArgs: [{ fontPaths: [FONT_DIR] }] },
);

mkdirSync(OUT_DIR, { recursive: true });

for (const sheet of SHEETS) {
  const spec = sheet.spec ?? SheetSpecSchema.parse(sheet.input);
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') {
    throw new Error(`${sheet.name}: ${result.axis} overflow in ${result.area}`);
  }

  const page = planPage(spec.paper, sheet.copies ?? 1);
  if (page === null) {
    throw new Error(`${sheet.name}: ${spec.paper} does not tile at ${String(sheet.copies)}`);
  }

  const source = renderSheetTypst(result.layout, {
    fonts: ['IBM Plex Sans Arabic', 'IBM Plex Sans', 'DejaVu Sans'],
    warningLines: sheet.warnings,
    theme: themeFor(sheet.darkness ?? 'normal'),
    page,
  });

  writeFileSync(resolve(OUT_DIR, `${sheet.name}.typ`), source, 'utf8');

  // Throws with the Typst diagnostic if the source is rejected.
  const pdf = compiler.pdf({ mainFileContent: source });
  writeFileSync(resolve(OUT_DIR, `${sheet.name}.pdf`), pdf);

  const svg = compiler.svg({ mainFileContent: source });
  if (typeof svg === 'string') {
    // Stated in millimetres, or a browser prints it a quarter too small.
    writeFileSync(
      resolve(OUT_DIR, `${sheet.name}.svg`),
      withPhysicalSize(svg, page.carrier),
      'utf8',
    );
  }

  process.stdout.write(`wrote ${sheet.name} (${String(pdf.length)} bytes)\n`);
}
