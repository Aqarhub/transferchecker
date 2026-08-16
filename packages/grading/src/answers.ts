// How one student's paper is stored, and it is one string.
//
// PLAN.md section 5 makes a decision this file has to keep: there is no
// `responses` table with a row per question, because a million teachers at a
// hundred papers a month at fifty questions is five billion rows a month. The
// answers of a whole paper are one text field, and item analysis is computed
// from those strings on demand. That decision is worth 95 percent of the
// database, so nothing here may quietly cost a row.
//
// But the shape the plan wrote down, one character per question holding the
// SYMBOL, cannot hold what the engine actually produces. `CORE-OMR.md` section
// 9 named the defect and left it open: a two character symbol does not fit in
// one character, and a `select: 'many'` question has no single symbol at all.
// A sheet with either of those would have been stored wrong, silently, and the
// stored record is what acceptance criterion 19 promises can reproduce a grade
// without keeping the student's photograph.
//
// So the token is the bubble's INDEX rather than its symbol:
//
//   '0'..'9'   the index of the bubble the student shaded
//   '?'        the student left it, which is their decision and not an error
//   '!'        the machine would not decide: two marks close, or every bubble
//              shaded, or a bubble glare destroyed
//   '[025]'    a `select: 'many'` question, the indexes it carries
//
// Three properties fall out, and they are the reason for the choice. It is one
// byte per question for every alphabet, where an Arabic symbol would have cost
// two or three. It is the SAME alphabet the answer key is written in, so a key
// and a paper are never compared across two encodings. And `MAX_SYMBOLS` is 10,
// so an index is always exactly one character and the common case keeps the
// width the plan costed.
//
// The price, stated because it is real: the string is meaningless without the
// sheet it was read from, since only the spec knows that index 2 was 'C'. That
// is safe precisely because a printed sheet is immutable: `SheetSpec.version`
// is 4 and a scan is bound to its `templateId`, so the list that resolves an
// index can never move under a stored paper.

import { MAX_SYMBOLS } from '@transferchecker/sheet-spec';

/** What one question of one paper carries, after the engine has read it. */
export type Answer =
  /** The student shaded exactly one bubble, at this index. */
  | { readonly kind: 'one'; readonly index: number }
  /** A `select: 'many'` question, with the indexes it carries, in order. */
  | { readonly kind: 'many'; readonly indexes: readonly number[] }
  /** The student left it. Never an error, and never worth points. */
  | { readonly kind: 'blank' }
  /** The machine refused to guess. Worth no points, and always shown. */
  | { readonly kind: 'unresolved' };

export const BLANK = '?';
export const UNRESOLVED = '!';

const DIGITS = '0123456789';

export const blank = (): Answer => ({ kind: 'blank' });
export const unresolved = (): Answer => ({ kind: 'unresolved' });

/** The index as its stored character, or null for an index no sheet can print. */
export function indexChar(index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_SYMBOLS) return null;
  return DIGITS[index] ?? null;
}

/** One answer as its token. Never throws: an impossible index reads unresolved. */
export function encodeAnswer(answer: Answer): string {
  switch (answer.kind) {
    case 'blank':
      return BLANK;
    case 'unresolved':
      return UNRESOLVED;
    case 'one':
      return indexChar(answer.index) ?? UNRESOLVED;
    case 'many': {
      // Sorted and de-duplicated, because two papers that carry the same set
      // have to produce the same string or the record stops being comparable.
      const seen = [...new Set(answer.indexes)].sort((a, b) => a - b);
      const chars = seen.map((index) => indexChar(index));
      if (chars.some((char) => char === null)) return UNRESOLVED;
      return chars.length === 0 ? BLANK : `[${chars.join('')}]`;
    }
  }
}

/** A whole paper as one string, in question order. */
export function encodeAnswers(answers: readonly Answer[]): string {
  return answers.map((answer) => encodeAnswer(answer)).join('');
}

/**
 * And back, with the question count as the check.
 *
 * Null rather than a partial read: a string that does not decode to exactly the
 * number of questions the exam has is a record bound to a different sheet, and
 * grading it would produce a real looking score against the wrong paper.
 */
export function decodeAnswers(stored: string, questions: number): Answer[] | null {
  const out: Answer[] = [];
  let at = 0;
  while (at < stored.length) {
    const char = stored[at];
    if (char === undefined) return null;
    if (char === BLANK) {
      out.push({ kind: 'blank' });
      at += 1;
    } else if (char === UNRESOLVED) {
      out.push({ kind: 'unresolved' });
      at += 1;
    } else if (char === '[') {
      const close = stored.indexOf(']', at);
      if (close === -1) return null;
      const inner = stored.slice(at + 1, close);
      const indexes: number[] = [];
      for (const digit of inner) {
        const index = DIGITS.indexOf(digit);
        if (index === -1) return null;
        indexes.push(index);
      }
      // An empty group would be a blank written two ways, and two spellings of
      // one fact is how a comparison of two records starts lying.
      if (indexes.length === 0) return null;
      out.push({ kind: 'many', indexes });
      at = close + 1;
    } else {
      const index = DIGITS.indexOf(char);
      if (index === -1) return null;
      out.push({ kind: 'one', index });
      at += 1;
    }
  }
  return out.length === questions ? out : null;
}

/** Whether two readings of one paper are the same record, for criterion 12. */
export function sameAnswers(left: readonly Answer[], right: readonly Answer[]): boolean {
  return encodeAnswers(left) === encodeAnswers(right);
}
