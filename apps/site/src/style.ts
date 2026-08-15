// The stylesheet, as one string with no build step.
//
// It is a separate file rather than an inline block so that it is cached once
// across pages, and it carries no font download: a marketing page that waits on
// a font is a page whose first paint is somebody else's uptime, and the system
// Arabic font on a Saudi teacher's phone is better at Arabic than a webfont we
// would pick for them.
//
// Logical properties throughout (`margin-inline`, `padding-inline`, `border-
// inline-start`) so the same rules lay out correctly in both directions. A
// stylesheet with `left` and `right` in it needs a second copy for Arabic, and
// the second copy is the one that rots.

export const STYLE = `:root {
  color-scheme: light dark;
  --ink: #16191d;
  --paper: #fbfaf8;
  --muted: #5c646e;
  --line: #dcd8d2;
  --accent: #1f5f4b;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ink: #eceff3;
    --paper: #14171a;
    --muted: #9aa3ad;
    --line: #2b3138;
    --accent: #6fcfae;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  line-height: 1.7;
  font-size: 17px;
}
header, main, footer { max-width: 44rem; margin-inline: auto; padding-inline: 1.25rem; }
header { padding-block: 3rem 1rem; }
.brand { font-weight: 700; letter-spacing: 0.04em; color: var(--accent); margin: 0; }
h1 { font-size: clamp(1.9rem, 5vw, 2.8rem); line-height: 1.25; margin: 0.4em 0 0.3em; }
.lede { font-size: 1.15rem; color: var(--muted); margin: 0; }
/* The language list. Eight names wrap on a phone, so it wraps by design rather
   than scrolling or collapsing behind a control this page has no script to
   open. Each item keeps a 44px touch height without a box around it. */
.switch { margin-block: 1.5rem 0; }
.switch ul { list-style: none; display: flex; flex-wrap: wrap; gap: 0 1.1rem; padding: 0; margin: 0; }
.switch li { margin: 0; }
.switch a { display: inline-flex; align-items: center; min-height: 44px; font-size: 0.95rem; }
.switch a[aria-current] { color: var(--ink); font-weight: 700; text-decoration: none; }
a { color: var(--accent); }
section { padding-block: 1.75rem; border-block-start: 1px solid var(--line); }
h2 { font-size: 1.3rem; margin: 0 0 0.6em; }
h3 { font-size: 1.05rem; margin: 0 0 0.3em; }
article { padding-block: 0.75rem; }
article p { margin: 0; color: var(--muted); }
ol { padding-inline-start: 1.4em; margin: 0; }
li { margin-block: 0.4em; }
#accuracy p, #privacy p, #scope p { margin: 0; }
footer { padding-block: 2rem 3rem; color: var(--muted); border-block-start: 1px solid var(--line); }
`;
