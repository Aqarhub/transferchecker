// One icon family, drawn here rather than installed.
//
// Design system rule 12: SVG from one family, never an emoji, one stroke
// weight. Drawn in this file because the set is eleven glyphs and an icon
// package is a dependency, a licence and a visual voice that is not ours.
//
// Every glyph: 20 by 20 box, 1.5 stroke, round caps and joins, no fills. That
// uniformity is most of what makes an icon set look like a set.
//
// AND NOTHING HERE IS MIRRORED FOR ARABIC. A right to left layout flips the
// page, not the meaning of a picture: an arrow that means "forward in time"
// still points the way time goes, and the answer SHEET has a physical left
// edge where its timing strip is printed. Mirroring the sheet would draw a
// piece of paper that does not exist.

const BOX = `viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;

const PATHS: Readonly<Record<string, string>> = {
  // The four sidebar destinations.
  exams: '<path d="M4.5 3.5h11v13h-11z"/><path d="M7.5 7.5h5M7.5 10.5h5M7.5 13.5h3"/>',
  students:
    '<circle cx="7.5" cy="7" r="2.5"/><path d="M3 16.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/><path d="M13 6.5a2 2 0 1 1 0 4M14 12.8c1.8.4 3 1.7 3 3.7"/>',
  sheets:
    '<path d="M4.5 3.5h11v13h-11z"/><path d="M4.5 6.5h2M4.5 9.5h2M4.5 12.5h2"/><circle cx="11" cy="8" r="1.4"/><circle cx="11" cy="12" r="1.4"/>',
  settings:
    '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.8v1.8M10 15.4v1.8M17.2 10h-1.8M4.6 10H2.8M15.1 4.9l-1.3 1.3M6.2 13.8l-1.3 1.3M15.1 15.1l-1.3-1.3M6.2 6.2 4.9 4.9"/>',

  // The five actions an exam owns.
  key: '<circle cx="7" cy="10" r="3"/><path d="M10 10h7M15 10v2.5M12.5 10v2"/>',
  scan: '<path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13"/><path d="M3 10h14"/>',
  review:
    '<path d="M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10Z"/><circle cx="10" cy="10" r="2"/>',
  analysis: '<path d="M3 16.5h14"/><path d="M6 16.5V11M10 16.5V6M14 16.5v-3"/>',
  tags: '<path d="M3.5 8.8V4.2a.7.7 0 0 1 .7-.7h4.6c.2 0 .4 0 .5.2l6.8 6.8a.7.7 0 0 1 0 1l-4.6 4.6a.7.7 0 0 1-1 0L3.7 9.3a.7.7 0 0 1-.2-.5Z"/><circle cx="6.6" cy="6.6" r="1"/>',

  // Small utilities.
  download: '<path d="M10 3v9M6.5 8.5 10 12l3.5-3.5"/><path d="M3.5 14v2.5h13V14"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  offline:
    '<path d="M3 7.5a10 10 0 0 1 14 0M6 11a6 6 0 0 1 8 0"/><circle cx="10" cy="14.5" r="1"/>',
};

export type IconName = keyof typeof PATHS;

export const ICON_NAMES = Object.keys(PATHS);

/**
 * One icon.
 *
 * `aria-hidden` by default and never the only label on a control, which is
 * priority one of the audit: an icon only button with no name is unusable by
 * anyone not looking at it.
 */
export function icon(name: string): string {
  const path = PATHS[name];
  if (path === undefined) return '';
  return `<svg ${BOX} aria-hidden="true" focusable="false" class="icon">${path}</svg>`;
}
