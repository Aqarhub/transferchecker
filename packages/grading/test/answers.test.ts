// The stored record, and the two shapes it had to grow to hold.
//
// `CORE-OMR.md` section 9 named both and left them open: a two character symbol
// does not fit in one character, and a `select: 'many'` question has no single
// symbol at all. Both are tested here against the encoding that replaced it.

import { describe, expect, it } from 'vitest';
import { MAX_SYMBOLS, arabicSymbols } from '@transferchecker/sheet-spec';
import { decodeAnswers, encodeAnswers, indexChar, sameAnswers } from '../src/answers';
import type { Answer } from '../src/answers';

describe('one paper is one string', () => {
  it('round trips every shape a question can end in', () => {
    const answers: Answer[] = [
      { kind: 'one', index: 0 },
      { kind: 'blank' },
      { kind: 'one', index: 9 },
      { kind: 'unresolved' },
      { kind: 'many', indexes: [0, 2, 5] },
    ];
    const stored = encodeAnswers(answers);
    expect(stored).toBe('0?9![025]');
    expect(decodeAnswers(stored, 5)).toEqual(answers);
  });

  it('costs exactly one character per question in the common case', () => {
    // The 95 percent saving in PLAN.md section 5 is this line. A sheet of fifty
    // ordinary questions is fifty characters, whatever alphabet it prints.
    const answers: Answer[] = Array.from({ length: 50 }, (_, at) => ({
      kind: 'one',
      index: at % 4,
    }));
    expect(encodeAnswers(answers)).toHaveLength(50);
  });

  it('holds an Arabic sheet at the same width, which a symbol could not', () => {
    // The defect in one sentence: this alphabet's symbols are multi byte, and
    // one of them was to be stored per question in a fixed width field.
    const symbols = arabicSymbols(4);
    expect(symbols.length).toBe(4);
    const stored = encodeAnswers(symbols.map((_, index) => ({ kind: 'one', index })));
    expect(stored).toBe('0123');
    // Plain ASCII, so the field's width in bytes is its width in questions on
    // every sheet this product prints.
    expect(/^[\x20-\x7e]+$/.test(stored)).toBe(true);
  });

  it('holds a select many question, which had no representation at all', () => {
    const answers: Answer[] = [{ kind: 'many', indexes: [1, 3] }];
    expect(encodeAnswers(answers)).toBe('[13]');
    expect(decodeAnswers('[13]', 1)).toEqual(answers);
  });

  it('writes one set exactly one way, so two records stay comparable', () => {
    // Two readings of one paper that disagree only in order are the same paper,
    // and acceptance criterion 12 compares the whole record for equality.
    const left: Answer[] = [{ kind: 'many', indexes: [3, 1, 1] }];
    const right: Answer[] = [{ kind: 'many', indexes: [1, 3] }];
    expect(encodeAnswers(left)).toBe('[13]');
    expect(sameAnswers(left, right)).toBe(true);
  });

  it('separates a blank from a question the machine would not decide', () => {
    // They are worth the same, nothing, and they are not the same fact: one is
    // the student's decision and the other is ours.
    expect(encodeAnswers([{ kind: 'blank' }])).toBe('?');
    expect(encodeAnswers([{ kind: 'unresolved' }])).toBe('!');
    expect(decodeAnswers('?', 1)).toEqual([{ kind: 'blank' }]);
    expect(decodeAnswers('!', 1)).toEqual([{ kind: 'unresolved' }]);
  });
});

describe('a record that cannot be trusted is refused rather than read', () => {
  it('refuses a string that is not this many questions', () => {
    // A score computed against the wrong sheet looks exactly like a real one.
    expect(decodeAnswers('012', 4)).toBeNull();
    expect(decodeAnswers('012', 2)).toBeNull();
    expect(decodeAnswers('012', 3)).not.toBeNull();
  });

  it('refuses malformed groups instead of guessing what was meant', () => {
    expect(decodeAnswers('[13', 1)).toBeNull();
    expect(decodeAnswers('[]', 1)).toBeNull();
    expect(decodeAnswers('[1x]', 1)).toBeNull();
    expect(decodeAnswers('A', 1)).toBeNull();
  });

  it('never writes an index no sheet can print', () => {
    expect(indexChar(MAX_SYMBOLS)).toBeNull();
    expect(indexChar(-1)).toBeNull();
    expect(indexChar(1.5)).toBeNull();
    // And an impossible index degrades to "would not decide", never to a letter.
    expect(encodeAnswers([{ kind: 'one', index: 99 }])).toBe('!');
    expect(encodeAnswers([{ kind: 'many', indexes: [1, 99] }])).toBe('!');
  });
});
