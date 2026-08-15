import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUBBLE,
  SheetSpecSchema,
  arabicSymbols,
  digitSymbols,
  latinSymbols,
  trueFalseSymbols,
} from '../src/index';
import { choiceQuestions, makeSpec } from './helpers';

const reject = (overrides: Record<string, unknown>): boolean =>
  !SheetSpecSchema.safeParse({ ...makeSpec(), ...overrides }).success;

describe('SheetSpecSchema', () => {
  it('defaults a written box to a medium width', () => {
    const spec = makeSpec({
      headerFields: [{ id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox' }],
    });
    expect(spec.headerFields[0]).toMatchObject({ kind: 'writtenBox', width: 'medium' });
  });

  it('defaults a question to an internal label', () => {
    const spec = makeSpec({
      questions: [{ kind: 'choice', symbols: ['A', 'B'] }],
    });
    expect(spec.questions[0]).toMatchObject({ placement: 'internal' });
  });

  it('defaults the column count to auto', () => {
    expect(makeSpec().columns).toBe('auto');
  });

  it('rejects a sheet with no questions', () => {
    expect(reject({ questions: [] })).toBe(true);
  });

  it('rejects more than two hundred questions', () => {
    expect(reject({ questions: choiceQuestions(201) })).toBe(true);
  });

  it('rejects fewer than two or more than ten symbols', () => {
    expect(reject({ questions: [{ kind: 'choice', symbols: ['A'] }] })).toBe(true);
    expect(reject({ questions: [{ kind: 'choice', symbols: [...latinSymbols(11)] }] })).toBe(true);
  });

  it('accepts any symbol set the teacher types, not just presets', () => {
    const spec = makeSpec({ questions: [{ kind: 'choice', symbols: [...trueFalseSymbols()] }] });
    expect(spec.questions[0]?.symbols).toEqual(['T', 'F']);
  });

  it('accepts a sheet that mixes symbol sets between questions', () => {
    const spec = makeSpec({
      questions: [
        { kind: 'choice', symbols: [...latinSymbols(5)] },
        { kind: 'choice', symbols: [...trueFalseSymbols()] },
      ],
    });
    expect(spec.questions.map((question) => question.symbols.length)).toEqual([5, 2]);
  });

  it('rejects metrics whose bubbles would touch, however sane each number looks', () => {
    // Every one of these is inside its own range. Only the combination is
    // wrong, which is why it has to be checked across fields.
    expect(reject({ bubble: { ...DEFAULT_BUBBLE, radiusMm: 3.5, pitchXMm: 5 } })).toBe(true);
    expect(reject({ bubble: { ...DEFAULT_BUBBLE, radiusMm: 3.5, pitchYMm: 6 } })).toBe(true);
    expect(reject({ bubble: { ...DEFAULT_BUBBLE, radiusMm: 3.5, gridPitchYMm: 5 } })).toBe(true);
  });

  it('leaves a millimetre of paper between one bubble and the next', () => {
    // A mark that strays out of one bubble must not land inside its neighbour.
    const { radiusMm, pitchXMm, pitchYMm, gridPitchYMm } = DEFAULT_BUBBLE;
    for (const pitch of [pitchXMm, pitchYMm, gridPitchYMm]) {
      expect(pitch - 2 * radiusMm).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects a template id that is not a uuid', () => {
    expect(reject({ templateId: 'not-a-uuid' })).toBe(true);
  });

  it('requires a name so a printed sheet can be identified by eye', () => {
    expect(reject({ name: '' })).toBe(true);
  });

  it('requires a usage so the system knows what a field means', () => {
    expect(
      reject({
        headerFields: [{ id: 'name', label: 'Name', kind: 'writtenBox' }],
      }),
    ).toBe(true);
  });

  it('accepts field labels in any language', () => {
    const spec = makeSpec({
      headerFields: [{ id: 'name', usage: 'studentName', label: 'اسم الطالب', kind: 'writtenBox' }],
    });
    expect(spec.headerFields[0]?.label).toBe('اسم الطالب');
  });

  it('carries a key version as an ordinary bubble grid, with no special case', () => {
    const spec = makeSpec({
      headerFields: [
        {
          id: 'key',
          usage: 'keyVersion',
          label: 'Key',
          kind: 'bubbleGrid',
          length: 1,
          symbols: ['A', 'B', 'C', 'D'],
        },
      ],
    });
    expect(spec.headerFields[0]).toMatchObject({ usage: 'keyVersion', length: 1 });
  });
});

describe('symbol presets', () => {
  it('offers ten digits', () => {
    expect(digitSymbols()).toHaveLength(10);
  });

  // I reads as 1 and O reads as 0 on a shaded sheet, so neither is ever printed.
  it('skips the letters that are read as digits', () => {
    const letters = latinSymbols(24);
    expect(letters).not.toContain('I');
    expect(letters).not.toContain('O');
    expect(letters.slice(0, 10)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K']);
  });

  it('uses abjad ordering for Arabic choices', () => {
    expect(arabicSymbols(4)).toEqual(['أ', 'ب', 'ج', 'د']);
  });
});
