// Integration check: the emitted source has to be valid Typst.
//
// The unit tests assert what the source says. This one asserts that Typst
// accepts it, which is the only way to catch a syntax slip in emission before
// it reaches a teacher trying to print.

import { describe, expect, it } from 'vitest';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { arabicSymbols, digitSymbols, latinSymbols } from '@transferchecker/sheet-spec';
import { encodeSheetQr, renderSheetTypst, sheetPayload } from '../src/index';
import { choiceQuestions, makeLayout, makeOptions } from './helpers';

const compiler = NodeCompiler.create();

// The compiler throws when it rejects the source, so a failure surfaces as a
// test error on its own.
const compile = (source: string): Uint8Array => compiler.pdf({ mainFileContent: source });

describe('generated Typst', () => {
  it('compiles a Latin sheet to a PDF', () => {
    const pdf = compile(renderSheetTypst(makeLayout(), makeOptions()));
    // Every PDF starts with the version header.
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(4000);
  });

  it('compiles an Arabic sheet, labels and choice letters included', () => {
    const layout = makeLayout({
      name: 'اختبار نهائي، رياضيات',
      questions: choiceQuestions(40, arabicSymbols(4)),
      headerFields: [
        { id: 'name', usage: 'studentName', label: 'اسم الطالب', kind: 'writtenBox' },
        {
          id: 'studentId',
          usage: 'studentId',
          label: 'رقم الطالب',
          kind: 'bubbleGrid',
          length: 4,
          symbols: [...digitSymbols()],
        },
      ],
    });
    const source = renderSheetTypst(layout, {
      ...makeOptions(),
      warningLines: ['اطبع بمقياس 100٪. لا تستخدم خيار ملاءمة الصفحة.'],
    });
    expect(compile(source).length).toBeGreaterThan(4000);
  });

  it('compiles a sheet whose choice letters sit beside the bubbles', () => {
    const layout = makeLayout({
      questions: choiceQuestions(40, latinSymbols(4), 'external'),
    });
    expect(compile(renderSheetTypst(layout, makeOptions())).length).toBeGreaterThan(4000);
  });

  it('compiles a sheet that mixes symbol sets between questions', () => {
    const layout = makeLayout({
      questions: [...choiceQuestions(20, latinSymbols(5)), ...choiceQuestions(20, ['T', 'F'])],
    });
    expect(compile(renderSheetTypst(layout, makeOptions())).length).toBeGreaterThan(4000);
  });

  it('compiles a dense sheet, four columns of a hundred questions', () => {
    const layout = makeLayout({
      questions: choiceQuestions(100),
      columns: 4,
      headerFields: [{ id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox' }],
    });
    expect(compile(renderSheetTypst(layout, makeOptions())).length).toBeGreaterThan(4000);
  });

  it('treats a hostile template name as text rather than executing it', () => {
    const source = renderSheetTypst(makeLayout({ name: '#panic("owned")' }), makeOptions());
    // A name that reached code position would abort the compile.
    expect(compile(source).length).toBeGreaterThan(4000);
  });
});

describe('sheet code', () => {
  it('encodes a payload the scanner can identify the template from', () => {
    const matrix = encodeSheetQr({
      templateId: '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90',
      version: 3,
    });
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    // A QR is square and carries the three finder patterns as dark corners.
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    expect(matrix[0]?.[0]).toBe(true);
    expect(matrix[0]?.[matrix.length - 1]).toBe(true);
    expect(matrix[matrix.length - 1]?.[0]).toBe(true);
  });

  it('keeps the payload short and positional', () => {
    const payload = sheetPayload({
      templateId: '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90',
      version: 3,
    });
    expect(payload).toBe('TC1:3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90:3');
  });
});
