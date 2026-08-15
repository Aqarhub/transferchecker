// The key, and the storage shape PLAN.md section 5 committed to.
//
// The shape is a string plus three sparse columns, and the point of testing it
// is that the sparse half must cost nothing on the sheets that do not use it.
// A key that serialised an empty object per question would have quietly undone
// the decision the whole schema rests on.

import { describe, expect, it } from 'vitest';
import { answerOf, answersOf } from '../src/read';
import { AnswerKeySchema, fromStored, toStored, unkeyed } from '../src/key';
import type { AnswerKey, QuestionKey } from '../src/key';

const q = (patch: Partial<QuestionKey> = {}): QuestionKey => ({
  intended: 0,
  points: 1,
  awards: [],
  tags: [],
  ...patch,
});

describe('the stored shape', () => {
  it('writes an ordinary key as one character per question and nothing else', () => {
    const key: AnswerKey = { form: 'A', questions: [q({ intended: 0 }), q({ intended: 2 })] };
    const stored = toStored(key);
    expect(stored.key).toBe('02');
    expect(stored.points).toEqual([1, 1]);
    // The sparse columns stay empty, which is the whole reason they are sparse.
    expect(stored.extras).toEqual({});
    expect(stored.tags).toEqual({});
  });

  it('round trips a key that uses every input the editor accepts', () => {
    const key: AnswerKey = {
      form: 'B',
      questions: [
        q({ intended: 1, points: 2 }),
        q({ intended: 3, awards: [{ index: 0, points: 0.5 }], tags: ['كسور', 'معيار-3.2'] }),
        unkeyed(),
        q({ intended: [0, 2], points: 1.5 }),
      ],
    };
    const back = fromStored(toStored(key));
    expect(back).toEqual(key);
  });

  it('keeps the key and the paper in ONE alphabet', () => {
    // A key written in symbols and a paper written in indexes would have to be
    // translated on every comparison, and the translation is where a grade goes
    // wrong on a sheet whose symbols are not A B C D.
    const key: AnswerKey = { form: 'A', questions: [q({ intended: 2 }), q({ intended: [0, 1] })] };
    expect(toStored(key).key).toBe('2[01]');
  });

  it('stores an unkeyed question as a blank rather than inventing an answer', () => {
    const stored = toStored({ form: 'A', questions: [unkeyed()] });
    expect(stored.key).toBe('?');
    expect(fromStored(stored)?.questions[0]?.intended).toBeNull();
  });

  it('refuses a stored key whose columns disagree about the question count', () => {
    expect(fromStored({ form: 'A', key: '012', points: [1, 1], extras: {}, tags: {} })).toBeNull();
    expect(fromStored({ form: 'A', key: 'zz', points: [1, 1], extras: {}, tags: {} })).toBeNull();
  });

  it('rejects points nobody could have meant', () => {
    const bad = { form: 'A', questions: [{ ...q(), points: 5000 }] };
    expect(AnswerKeySchema.safeParse(bad).success).toBe(false);
    const badIndex = { form: 'A', questions: [{ ...q(), intended: 10 }] };
    expect(AnswerKeySchema.safeParse(badIndex).success).toBe(false);
  });
});

describe('what the engine hands over', () => {
  it('keeps the letter of an uncertain answer, and drops the letter of an undecided one', () => {
    // Dropping the letter of a doubted answer would turn a flag into a lost
    // mark, which is acceptance criterion 11 failing from the other side.
    expect(
      answerOf({
        kind: 'answer',
        index: 2,
        symbol: 'C',
        margin: 0.01,
        uncertain: true,
        escaped: false,
        trace: false,
      }),
    ).toEqual({ kind: 'one', index: 2 });
    expect(answerOf({ kind: 'ambiguous', reason: 'two_close', margin: 0.01 })).toEqual({
      kind: 'unresolved',
    });
    expect(answerOf({ kind: 'unmeasurable', worst: 0.4 })).toEqual({ kind: 'unresolved' });
    expect(answerOf({ kind: 'blank', margin: 0.3, trace: true })).toEqual({ kind: 'blank' });
  });

  it('reads the sheet in printed order however the engine returned it', () => {
    const answers = answersOf([
      { question: 3, outcome: { kind: 'blank', margin: 0.3, trace: false } },
      {
        question: 1,
        outcome: {
          kind: 'multiple',
          indexes: [0, 2],
          symbols: ['A', 'C'],
          margin: 0.2,
          uncertain: false,
        },
      },
      { question: 2, outcome: { kind: 'ambiguous', reason: 'all_marked', margin: 0.1 } },
    ]);
    expect(answers).toEqual([
      { kind: 'many', indexes: [0, 2] },
      { kind: 'unresolved' },
      { kind: 'blank' },
    ]);
  });
});
