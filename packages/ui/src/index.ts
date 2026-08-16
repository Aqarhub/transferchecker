// The shared interface layer, used by the dashboard and by the marketing site.
//
// It exists so the two are visibly one product. A visitor who reads the site
// and then opens the app should not be able to tell that two things built them,
// and the only reliable way to get that is one set of parts rather than two
// sets that agree today.

export { APP_CSS } from './app-css';
export { barChart, distractorChart } from './chart';
export type { Bar, BarChartOptions } from './chart';
export { ICON_NAMES, icon } from './icons';
export { LOCALES, localeOf, ltr, pseudo } from './locale';
export type { Direction, LocaleInfo } from './locale';
export { bubble, button, esc, help, marksStrip, resetHelpIds, section, stat, table } from './parts';
export type { Column, Emphasis, Outcome, SectionOptions } from './parts';
export { screenHeader, shell, tabs } from './shell';
export type { HeaderOptions, NavItem, ShellOptions, SyncState } from './shell';
export { contrast, hexToRgb, palette, tokensCss, tokensPath } from './tokens';
export type { Rgb } from './tokens';
