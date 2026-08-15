// Integration check: the emitted source has to be valid Typst.
//
// The unit tests assert what the source says. This one asserts that Typst
// accepts it, which is the only way to catch a syntax slip in emission before
// it reaches a teacher trying to print.

import { describe, expect, it } from 'vitest';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { arabicSymbols, digitSymbols, latinSymbols } from '@transferchecker/sheet-spec';
import { DARKNESS_LEVELS, planPage, renderSheetTypst, themeFor } from '../src/index';
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
      // Four choices rather than five. Defenses د1 and د3 took 12 mm of content
      // width and the anchor's clearance took 6 mm more, so four columns of
      // five choices no longer fit A4 at the default bubble: 169.6 mm of ink
      // and gap against 164 mm of content [measured]. Three columns of five is
      // the widest A4 now takes with the identifier sidebar beside it.
      questions: choiceQuestions(100, latinSymbols(4)),
      columns: 4,
      headerFields: [{ id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox' }],
    });
    expect(compile(renderSheetTypst(layout, makeOptions())).length).toBeGreaterThan(4000);
  });

  it('compiles a sheet whose code carries an identifier alone', () => {
    const layout = makeLayout({ code: 'short' });
    expect(compile(renderSheetTypst(layout, makeOptions())).length).toBeGreaterThan(4000);
  });

  it('compiles two half page sheets on one page, and four quarter page ones', () => {
    for (const [paper, copies] of [
      ['A5', 2],
      ['A6', 4],
    ] as const) {
      const page = planPage(paper, copies);
      expect(page).not.toBeNull();
      if (page === null) continue;
      // A small sheet gets a small configuration: no id sidebar, and the
      // column count left to the engine. Eight questions rather than ten,
      // because defense د1 costs the same 16 mm of height on every paper size
      // and a quarter page sheet has the least of it to give: A6 held ten rows
      // at the default pitch and now holds eight [measured].
      const layout = makeLayout({
        paper,
        columns: 'auto',
        questions: choiceQuestions(8, latinSymbols(4)),
        headerFields: [{ id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox' }],
      });
      const source = renderSheetTypst(layout, makeOptions({ page }));
      expect(compile(source).length).toBeGreaterThan(4000);
    }
  });

  it('compiles at every darkness', () => {
    for (const level of DARKNESS_LEVELS) {
      const source = renderSheetTypst(makeLayout(), makeOptions({ theme: themeFor(level) }));
      expect(compile(source).length).toBeGreaterThan(4000);
    }
  });

  it('treats a hostile template name as text rather than executing it', () => {
    const source = renderSheetTypst(makeLayout({ name: '#panic("owned")' }), makeOptions());
    // A name that reached code position would abort the compile.
    expect(compile(source).length).toBeGreaterThan(4000);
  });
});
