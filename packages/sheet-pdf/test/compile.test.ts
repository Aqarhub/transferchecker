// Integration check: the emitted source has to be valid Typst.
//
// The unit tests assert what the source says. This one asserts that Typst
// accepts it, which is the only way to catch a syntax slip in emission before
// it reaches a teacher trying to print.

import { describe, expect, it } from 'vitest';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { encodeSheetQr, renderSheetTypst, sheetPayload } from '../src/index';
import { makeLayout, makeOptions } from './helpers';

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
      choices: 4,
      choiceLabels: 'arabic',
      title: 'اختبار نهائي، رياضيات',
      headerFields: [
        { id: 'name', label: 'اسم الطالب', kind: 'writtenBox', widthMm: 72 },
        { id: 'studentId', label: 'رقم الطالب', kind: 'bubbleGrid', length: 4, alphabet: 'digits' },
      ],
    });
    const source = renderSheetTypst(layout, {
      ...makeOptions(),
      warningLines: ['اطبع بمقياس 100٪. لا تستخدم خيار ملاءمة الصفحة.'],
    });
    expect(compile(source).length).toBeGreaterThan(4000);
  });

  it('compiles a dense sheet, four columns of a hundred questions', () => {
    const layout = makeLayout({
      questions: 100,
      columns: 4,
      choices: 5,
      headerFields: [{ id: 'name', label: 'Name', kind: 'writtenBox', widthMm: 60 }],
    });
    expect(compile(renderSheetTypst(layout, makeOptions())).length).toBeGreaterThan(4000);
  });

  it('treats a hostile title as text rather than executing it', () => {
    const source = renderSheetTypst(makeLayout({ title: '#panic("owned")' }), makeOptions());
    // A title that reached code position would abort the compile.
    expect(compile(source).length).toBeGreaterThan(4000);
  });
});

describe('sheet code', () => {
  it('encodes a payload the scanner can identify the template from', () => {
    const matrix = encodeSheetQr({
      templateId: '3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90',
      version: 2,
      formCode: 'A',
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
      version: 2,
      formCode: 'A',
    });
    expect(payload).toBe('TC1:3f1c9a52-6d4b-4a41-9f0e-2c7b8d5e1a90:2:A');
  });
});
