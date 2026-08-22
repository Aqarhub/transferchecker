// The six screens and where each one lives.
//
// Its own module so that a screen needing to link to another screen does not
// have to import the file that renders it. That import runs the other way as
// well, and a cycle between two rendering modules is the kind of thing that
// works until the day a bundler changes its evaluation order.

export const SCREENS = ['exams', 'exam', 'students', 'sheets', 'sheet', 'settings'] as const;
export type Screen = (typeof SCREENS)[number];

export function pathOf(locale: string, screen: Screen): string {
  return screen === 'exams' ? `/${locale}/` : `/${locale}/${screen}/`;
}
