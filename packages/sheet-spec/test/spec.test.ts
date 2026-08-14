import { describe, expect, it } from 'vitest';
import { SheetSpecSchema, alphabetSymbols, choiceSymbols } from '../src/index';
import { makeSpec } from './helpers';

describe('SheetSpecSchema', () => {
  it('applies the default written box width', () => {
    const spec = makeSpec({
      headerFields: [{ id: 'name', label: 'Name', kind: 'writtenBox' }],
    });
    expect(spec.headerFields[0]).toMatchObject({ kind: 'writtenBox', widthMm: 60 });
  });

  it('rejects a question count outside the supported range', () => {
    expect(SheetSpecSchema.safeParse({ ...makeSpec(), questions: 0 }).success).toBe(false);
    expect(SheetSpecSchema.safeParse({ ...makeSpec(), questions: 201 }).success).toBe(false);
  });

  it('rejects more choices than any label style can express', () => {
    expect(SheetSpecSchema.safeParse({ ...makeSpec(), choices: 7 }).success).toBe(false);
  });

  it('rejects a template id that is not a uuid', () => {
    expect(SheetSpecSchema.safeParse({ ...makeSpec(), templateId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('rejects a form code outside A to D', () => {
    expect(SheetSpecSchema.safeParse({ ...makeSpec(), formCode: 'E' }).success).toBe(false);
  });

  it('accepts field labels in any language', () => {
    const spec = makeSpec({
      headerFields: [{ id: 'name', label: 'اسم الطالب', kind: 'writtenBox' }],
    });
    expect(spec.headerFields[0]?.label).toBe('اسم الطالب');
  });
});

describe('alphabets', () => {
  it('exposes ten digits, twenty six Latin letters and twenty eight Arabic letters', () => {
    expect(alphabetSymbols('digits')).toHaveLength(10);
    expect(alphabetSymbols('latin')).toHaveLength(26);
    expect(alphabetSymbols('arabic')).toHaveLength(28);
  });

  it('uses abjad ordering for Arabic answer choices', () => {
    expect(choiceSymbols('arabic', 4)).toEqual(['أ', 'ب', 'ج', 'د']);
  });

  it('returns only as many choice symbols as requested', () => {
    expect(choiceSymbols('latin', 3)).toEqual(['A', 'B', 'C']);
  });
});
