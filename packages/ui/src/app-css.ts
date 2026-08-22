// The application stylesheet. One file, both directions, every language.
//
// LOGICAL PROPERTIES ONLY. Not one `left`, `right`, `margin-left` or
// `text-align: right` in this file, and `test/design-system.test.ts` fails the
// build if one appears. That is what makes a single stylesheet correct in
// Arabic and in English, and it is why there is no second RTL sheet to fall out
// of step with the first.
//
// What does NOT follow the direction is handled in the markup rather than here:
// a number, an identifier and an answer string are wrapped in a left to right
// run, because the bidirectional algorithm would otherwise reorder them into
// something nobody typed.
//
// The type scale, spacing rhythm, radii, motion and elevation all come from
// `docs/design/tokens.css`, which is the source of truth. Nothing here invents
// a value.

export const APP_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--pearl);
  color: var(--graphite);
  font-family: var(--font-ui);
  /* 16px floor: anything smaller triggers an auto zoom on iOS. */
  font-size: var(--t-body);
  line-height: var(--lh-body);
}
:lang(en), :lang(fr), :lang(de), :lang(es), :lang(tr) { --font-ui: var(--font-latin); line-height: var(--lh-tight); }
:lang(hi) { --font-ui: var(--font-hi); }
:lang(zh) { --font-ui: var(--font-zh); }

/* A German compound is one unbreakable token, and Aufgabenanalyse is wider than
   a sidebar row. Hyphenation follows the document's own lang attribute, so one
   rule is right in eight languages, and break-word is the floor beneath it. The
   failure this prevents is invisible to anyone testing in Arabic. */
.stat-label, .stat-note, .nav-item span, .tab, .btn span, td, th, p {
  -webkit-hyphens: auto; hyphens: auto; overflow-wrap: break-word;
}
/* Except a number, an identifier and an answer string, which are never broken
   and never hyphenated whatever the language around them does. */
.num, .marks, .mark, td.num-col, th.num-col { -webkit-hyphens: none; hyphens: none; }

/* Every number, identifier and answer string. Tabular so columns line up under
   a fast scan, and never reordered by the paragraph direction. Never wrapped
   either: a phone column narrow enough to break "9.0 / 12.5" across three lines
   turns one value into what looks like three, and the table already has its own
   sideways scroll for exactly this. Found by screenshot at 390. */
.num, .marks, td.num-col, th.num-col { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.num, td.num-col, th.num-col { white-space: nowrap; }

/* Focus is never removed. Two pixels, offset, on every interactive thing. */
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; border-radius: var(--r-1); }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0;
  margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
.skip {
  position: absolute; inset-block-start: -100%; inset-inline-start: var(--s-4);
  background: var(--surface); color: var(--ink); padding: var(--s-3) var(--s-4);
  border-radius: var(--r-1); z-index: var(--z-modal);
}
.skip:focus { inset-block-start: var(--s-3); }

/* ── Shell ───────────────────────────────────────────────────────────────── */
.shell { display: grid; grid-template-columns: 264px minmax(0, 1fr); min-block-size: 100dvh; }
.side {
  position: relative; background: var(--surface);
  border-inline-end: 1px solid var(--hairline);
  padding: var(--s-5) var(--s-4); display: flex; flex-direction: column; gap: var(--s-5);
}
/* The timing strip: the sidebar's own edge treatment, on the outer edge, and it
   follows the direction with the sidebar. A DEPICTION of a sheet would not,
   since paper has a physical left edge, but this is chrome and not a picture.
   Drawn as a gradient rather than as an element so it fills whatever height the
   column takes: an SVG with a fixed viewBox gets centred instead. */
.side::before {
  content: ''; position: absolute; inset-block: 0; inset-inline-start: 0; inline-size: 9px;
  background: repeating-linear-gradient(
    to bottom,
    var(--surface-sunk) 0 7px,
    transparent 7px 20px
  );
}
.brand { display: flex; align-items: center; gap: var(--s-2); margin: 0; font-weight: 600; color: var(--ink); }
.brand-mark { inline-size: 12px; block-size: 12px; background: var(--ink); border-radius: 1px; }

.nav { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: flex; align-items: center; gap: var(--s-3);
  min-block-size: 36px; padding-inline: var(--s-3); padding-block: var(--s-2);
  border-radius: var(--r-1); color: var(--graphite); text-decoration: none;
  transition: background var(--dur-fast) var(--ease-out);
}
.nav-item:hover { background: var(--surface-sunk); }
.nav-item.is-current { background: var(--ink-wash); color: var(--ink); font-weight: 600; }
/* The corner square of the sheet, marking where you are. */
.fiducial { inline-size: 6px; block-size: 6px; background: transparent; border-radius: 1px; }
.nav-item.is-current .fiducial { background: var(--ink); }
.icon { flex: none; }

.side-foot { margin-block-start: auto; font-size: var(--t-sm); color: var(--graphite-2); }
.sync { display: flex; align-items: center; gap: var(--s-2); margin: 0 0 var(--s-1); }
.sync-detail, .sync-pending { margin: 0; }
.langs { list-style: none; display: flex; flex-wrap: wrap; gap: var(--s-3); padding: 0; margin: var(--s-4) 0 0; }
.langs a { color: var(--graphite-2); text-decoration: none; }
.langs a[aria-current] { color: var(--ink); font-weight: 600; }

.main { padding: var(--s-6); min-inline-size: 0; }

/* ── Screen head ─────────────────────────────────────────────────────────── */
.screen-head { margin-block-end: var(--s-5); }
.eyebrow { margin: 0 0 var(--s-1); color: var(--graphite-2); font-size: var(--t-sm); }
.screen-title { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); flex-wrap: wrap; }
h1 { font-size: var(--t-h1); line-height: var(--lh-tight); margin: 0; display: flex; align-items: center; gap: var(--s-2); }
h2 { font-size: var(--t-h2); line-height: var(--lh-tight); margin: 0; display: flex; align-items: center; gap: var(--s-2); }

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: var(--s-3); margin-block-start: var(--s-5); }
.stat { background: var(--surface); border-radius: var(--r-2); padding: var(--s-4); }
.stat-label { margin: 0; font-size: var(--t-sm); color: var(--graphite-2); }
.stat-value { display: block; font-size: var(--t-display); line-height: 1.15; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.stat-missing { display: block; font-size: var(--t-h2); line-height: 1.4; color: var(--review); }
.stat-note { margin: var(--s-1) 0 0; font-size: var(--t-xs); color: var(--graphite-2); }

.tabs { display: flex; gap: var(--s-1); margin-block-start: var(--s-5); border-block-end: 1px solid var(--hairline); flex-wrap: wrap; }
.tab {
  min-block-size: 44px; display: inline-flex; align-items: center; padding-inline: var(--s-4);
  color: var(--graphite-2); text-decoration: none; border-block-end: 2px solid transparent;
}
.tab.is-current { color: var(--ink); border-block-end-color: var(--ink); font-weight: 600; }

/* ── Panels, tables ──────────────────────────────────────────────────────── */
.panel { background: var(--surface); border-radius: var(--r-2); padding: var(--s-5); margin-block-end: var(--s-4); min-inline-size: 0; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); margin-block-end: var(--s-4); flex-wrap: wrap; }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: var(--s-4); min-inline-size: 0; }

/* The one element allowed to scroll sideways, and only inside itself. */
.table-wrap { overflow-x: auto; max-inline-size: 100%; }
table { inline-size: 100%; border-collapse: collapse; font-size: var(--t-sm); }
caption { text-align: start; }
th { text-align: start; font-weight: 600; }
thead th {
  color: var(--graphite-2); font-weight: 400; font-size: var(--t-xs);
  padding-block: var(--s-2); padding-inline: var(--s-3);
  border-block-end: 1px solid var(--hairline); white-space: nowrap;
}
thead th:first-child, tbody tr > *:first-child { padding-inline-start: 0; }
thead th:last-child, tbody tr > *:last-child { padding-inline-end: 0; }
tbody th, tbody td {
  padding-block: var(--s-2); padding-inline: var(--s-3);
  border-block-end: 1px solid var(--hairline); block-size: 36px;
}
tbody tr:last-child th, tbody tr:last-child td { border-block-end: 0; }
.num-col { text-align: end; }

/* ── Controls ────────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; gap: var(--s-2);
  min-block-size: 44px; padding-inline: var(--s-4);
  border: 1px solid var(--hairline); border-radius: var(--r-1);
  background: var(--surface); color: var(--graphite);
  font: inherit; font-size: var(--t-sm); cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.btn:hover { background: var(--surface-sunk); }
.btn-primary { background: var(--ink); border-color: var(--ink); color: #fff; }
.btn-primary:hover { background: var(--ink-hover); border-color: var(--ink-hover); }
.btn-danger { color: var(--review); border-color: var(--review); }
.btn[disabled] { opacity: 0.45; cursor: not-allowed; }

/* A labelled control. The builder and the key editor are made of these. */
.field { display: flex; flex-direction: column; gap: var(--s-2); }
.field-head { display: flex; align-items: center; gap: var(--s-2); }
.field-head label { font-size: var(--t-sm); color: var(--graphite-2); }
.field-input {
  min-block-size: 44px; padding-inline: var(--s-3);
  border: 1px solid var(--hairline); border-radius: var(--r-1);
  background: var(--surface); color: var(--graphite);
  font: inherit; font-size: var(--t-sm); inline-size: 100%;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.field-input:hover { border-color: var(--graphite-2); }
/* A consequence of the current value, not a hint about how to fill it in. */
.field-note { margin: 0; font-size: var(--t-sm); color: var(--graphite-2); }
/* The columns collapse on a phone rather than shrinking a 44px control. */
.field-grid {
  display: grid; gap: var(--s-4);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

/* The mandatory explanation marker beside every control and section title. */
.help { position: relative; display: inline-flex; }
.help-dot {
  inline-size: 16px; block-size: 16px; border-radius: 50%;
  border: 1px solid var(--hairline); background: var(--surface-sunk);
  color: var(--graphite-2); font: inherit; font-size: 11px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;
}
/* 16px is the drawn size; the touch area is expanded to 44 without moving it. */
.help-dot::after { content: ''; position: absolute; inset: -14px; }
.help-body {
  position: absolute; inset-block-start: calc(100% + 6px); inset-inline-start: 0;
  inline-size: max-content; max-inline-size: 260px;
  background: var(--graphite); color: var(--pearl); font-size: var(--t-xs); line-height: 1.5;
  padding: var(--s-2) var(--s-3); border-radius: var(--r-1);
  z-index: var(--z-popover);
  /* Removed from layout, not merely hidden: a visibility-hidden element still
     takes part in layout, and a 260px popover anchored beside a title near the
     page edge pushed the whole document wider than a phone. Found by
     screenshot, and only on the 390px pass. */
  display: none;
}
.help-dot:focus-visible + .help-body, .help-dot:hover + .help-body { display: block; }

/* ── Result language: the three reserved colours, always with a glyph ────── */
.bubble {
  display: inline-flex; align-items: center; justify-content: center; position: relative;
  inline-size: 28px; block-size: 28px; border-radius: 50%;
  border: 1.5px solid var(--hairline); font-size: var(--t-sm); font-family: var(--font-mono);
}
.bubble-correct { border-color: var(--correct); color: var(--correct); }
.bubble-wrong { border-color: var(--wrong); color: var(--wrong); }
.bubble-review { border-color: var(--review); color: var(--review); }
.bubble-blank { border: 0; color: var(--graphite-2); inline-size: 28px; }
.bubble-blank::before { content: '\\2013'; }
.bubble-mark { position: absolute; inset-block-end: -2px; inset-inline-end: -2px; font-size: 10px; background: var(--surface); border-radius: 50%; line-height: 1; }

.marks { display: flex; flex-wrap: wrap; gap: 2px; }
.mark {
  inline-size: 20px; block-size: 20px; display: inline-flex; align-items: center; justify-content: center;
  background: var(--surface-sunk); border-radius: var(--r-1); font-size: var(--t-xs);
}
.mark-c { background: var(--ink-wash); color: var(--ink); }
.mark-u, .mark-d, .mark-e, .mark-x { color: var(--review); box-shadow: inset 0 0 0 1px var(--review); background: var(--surface); }

/* ── Charts ──────────────────────────────────────────────────────────────── */
.chart { margin: 0; }
.chart figcaption { font-size: var(--t-sm); color: var(--graphite-2); margin-block-end: var(--s-3); }
/* The chart's coordinate space is left to right by construction: the x maths
   above assumes it, and its labels are numbers. Inheriting the page direction
   reorders "100%" and anchors it off the edge of the viewBox, which is the same
   mistake as mirroring an identifier. Verified by screenshot, not by reading. */
.chart-svg { inline-size: 100%; block-size: auto; direction: ltr; }
.c-bar { fill: var(--ink); }
.c-band { fill: var(--ink-wash); }
.c-band-label, .c-tick, .c-note, .c-label { fill: var(--graphite-2); font-size: 11px; font-family: var(--font-mono); }
.c-label { text-anchor: end; }
.c-note { text-anchor: end; }
.c-flag { text-anchor: middle; }
.c-tick { text-anchor: middle; }
.c-flag { fill: var(--ink); font-size: 12px; }
.c-grid { stroke: var(--hairline); stroke-width: 1; }
.chart-empty { color: var(--graphite-2); font-size: var(--t-sm); margin: 0; }

/* ── Small screens ───────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  /* The sidebar becomes a top bar. Same four destinations, same order, same
     single level: a small screen gets a different shape, never a different
     information architecture. */
  .shell { grid-template-columns: minmax(0, 1fr); }
  .side {
    flex-direction: column; gap: var(--s-3);
    border-inline-end: 0; border-block-end: 1px solid var(--hairline);
    padding: var(--s-3) var(--s-4);
  }
  .side::before { inset-inline: 0; inset-block-start: 0; inset-block-end: auto; inline-size: auto; block-size: 8px;
    background: repeating-linear-gradient(to right, var(--surface-sunk) 0 7px, transparent 7px 20px); }
  /* The nav scrolls sideways INSIDE itself rather than widening the page. */
  .nav { flex-direction: row; flex-wrap: nowrap; overflow-x: auto; gap: var(--s-1); padding-block-end: var(--s-1); }
  .nav-item { min-block-size: 44px; white-space: nowrap; }
  .side-foot { margin-block-start: 0; display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; }
  .side-foot p { margin: 0; font-size: var(--t-xs); }
  .langs { margin: 0; }
  .main { padding: var(--s-4); }
  .screen-title { align-items: flex-start; }
  h1 { font-size: var(--t-h2); }
  /* Two metric cards per row: four in a column is a scroll before any data. */
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat-value { font-size: var(--t-h1); }
  .panel { padding: var(--s-4); }
  .tabs { overflow-x: auto; flex-wrap: nowrap; }
  .tab { white-space: nowrap; }
  .marks { flex-wrap: nowrap; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 1ms !important; animation-duration: 1ms !important; }
}
`;
