// Integration check: the emitted source has to be valid Typst.
//
// The unit tests assert what the source says. This one asserts that Typst
// accepts it, which is the only way to catch a syntax slip in emission before
// it reaches a teacher trying to print.

import { describe, expect, it } from 'vitest';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { arabicSymbols, digitSymbols, latinSymbols } from '@transferchecker/sheet-spec';
import { renderSheetTypst } from '../src/index';
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

  it('compiles a sheet whose code carries an identifier alone', () => {
    const layout = makeLayout({ code: 'short' });
    expect(compile(renderSheetTypst(layout, makeOptions())).length).toBeGreaterThan(4000);
  });

  it('treats a hostile template name as text rather than executing it', () => {
    const source = renderSheetTypst(makeLayout({ name: '#panic("owned")' }), makeOptions());
    // A name that reached code position would abort the compile.
    expect(compile(source).length).toBeGreaterThan(4000);
  });
});
