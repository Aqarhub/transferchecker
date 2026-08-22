// The declared form, crossing between `formOf`'s vocabulary and the column.
//
// `formOf` in core-omr returns three states and the distinction between the
// first two is the whole point of that function: `undefined` when the sheet
// prints no version box at all, `null` when it prints one and the paper did not
// answer it, and a string when the paper said which form it is. A column cannot
// hold `undefined`, so the encoding is:
//
//   SQL NULL          the sheet prints no version box
//   ''                it prints one and the paper did not answer it
//   'A'               the paper said A
//
// These two functions are the only translation, in both directions. A second
// copy of this mapping is how the two NULL-ish states quietly merge, and merging
// them means either refusing every quick20, which never declares a form, or
// letting a blank box grade silently against whichever key the caller held,
// which is the wrong-grade-with-nothing-on-the-record defect the column closes.

/** What the column stores for the form a paper declared, from `formOf`'s value. */
export function storedForm(declared: string | null | undefined): string | null {
  if (declared === undefined) return null;
  if (declared === null) return '';
  return declared;
}

/** The column's value back in the vocabulary `formOf` speaks and grading takes. */
export function declaredForm(stored: string | null): string | null | undefined {
  if (stored === null) return undefined;
  if (stored === '') return null;
  return stored;
}
