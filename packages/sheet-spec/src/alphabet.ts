// Symbol sets printed inside bubbles.
//
// A bubble always carries the symbol it represents, so the scanner never needs
// to know what kind of field it is looking at: it reads a group of bubbles and
// reports the symbol of the filled one.

export const ALPHABET_NAMES = ['digits', 'latin', 'arabic'] as const;

export type AlphabetName = (typeof ALPHABET_NAMES)[number];

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

const LATIN = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
] as const;

// The 28 letters of the Arabic alphabet in standard order.
const ARABIC = [
  'ا',
  'ب',
  'ت',
  'ث',
  'ج',
  'ح',
  'خ',
  'د',
  'ذ',
  'ر',
  'ز',
  'س',
  'ش',
  'ص',
  'ض',
  'ط',
  'ظ',
  'ع',
  'غ',
  'ف',
  'ق',
  'ك',
  'ل',
  'م',
  'ن',
  'ه',
  'و',
  'ي',
] as const;

const ALPHABETS: Readonly<Record<AlphabetName, readonly string[]>> = {
  digits: DIGITS,
  latin: LATIN,
  arabic: ARABIC,
};

/** Every symbol of an alphabet, in printed order from top to bottom. */
export function alphabetSymbols(name: AlphabetName): readonly string[] {
  return ALPHABETS[name];
}

export const CHOICE_LABEL_NAMES = ['latin', 'arabic'] as const;

export type ChoiceLabelName = (typeof CHOICE_LABEL_NAMES)[number];

// Answer choices use the abjad ordering conventional on Arabic exam papers,
// which is not the alphabetical order used by a bubbled name grid.
const ARABIC_CHOICES = ['أ', 'ب', 'ج', 'د', 'ه', 'و'] as const;

/** The first `count` answer-choice symbols for the requested label style. */
export function choiceSymbols(labels: ChoiceLabelName, count: number): readonly string[] {
  const source = labels === 'arabic' ? ARABIC_CHOICES : LATIN;
  return source.slice(0, count);
}

/** Largest number of answer choices any label style can express. */
export const MAX_CHOICES = ARABIC_CHOICES.length;
