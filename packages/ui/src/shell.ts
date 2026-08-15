// The dashboard shell: sidebar, screen header, and the status that never hides.
//
// The structure is the one the best products in this class converged on, and
// for reasons rather than fashion: a persistent sidebar at 264px so nobody ever
// wonders how to get back, 36px rows in it because a desktop sidebar is a mouse
// target and 44px there wastes a third of the column, a metric strip of four
// numbers at the top of a screen because five to nine is where a reader stops
// being able to hold a dashboard in their head, and list to detail with tabs so
// the product scales from five screens to fifty without a restructure.
//
// WHAT MAKES IT THIS PRODUCT AND NOT A TEMPLATE: the chrome is the answer
// sheet's own furniture. The strip down the sidebar edge is a TIMING STRIP, the
// same marks the scanner reads to find a row. The active navigation item is
// marked by a filled square, which is the corner fiducial, the 8mm block
// printed at each corner of every sheet. Neither is decoration borrowed from
// somewhere; they are the instrument this product is built around, and no other
// dashboard could wear them honestly.
//
// THE STRIP FOLLOWS THE LAYOUT; A PICTURE OF A SHEET WOULD NOT. The strip is
// the sidebar's own edge treatment, so it sits on the outer edge in both
// directions and moves with the sidebar. That is the opposite of the rule for
// an actual DEPICTION of a sheet, which is a physical object with a left edge
// and must never be flipped, and the two are worth keeping apart: mirroring the
// interface is right, mirroring a picture of a real object is the classic
// right to left mistake.

import { icon } from './icons';
import { esc, help } from './parts';
import type { LocaleInfo } from './locale';

export interface NavItem {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly glyph: string;
}

export interface SyncState {
  readonly label: string;
  readonly lastSync: string;
  readonly pending: number;
  readonly pendingLabel: string;
}

export interface ShellOptions {
  readonly locale: LocaleInfo;
  readonly brand: string;
  readonly nav: readonly NavItem[];
  readonly active: string;
  readonly sync: SyncState;
  readonly languages: readonly { code: string; href: string; name: string; current: boolean }[];
  readonly skipLabel: string;
  readonly navLabel: string;
  readonly body: string;
}

export function shell(options: ShellOptions): string {
  const items = options.nav
    .map((item) => {
      const current = item.key === options.active;
      return `<li><a href="${esc(item.href)}" class="nav-item${current ? ' is-current' : ''}"${current ? ' aria-current="page"' : ''}><span class="fiducial" aria-hidden="true"></span>${icon(item.glyph)}<span>${esc(item.label)}</span></a></li>`;
    })
    .join('');

  const languages = options.languages
    .map(
      (language) =>
        `<li><a href="${esc(language.href)}" hreflang="${esc(language.code)}" lang="${esc(language.code)}"${language.current ? ' aria-current="true"' : ''}>${esc(language.name)}</a></li>`,
    )
    .join('');

  return `<a class="skip" href="#main">${esc(options.skipLabel)}</a>
<div class="shell">
<nav class="side" aria-label="${esc(options.navLabel)}">
  <p class="brand"><span class="brand-mark" aria-hidden="true"></span>${esc(options.brand)}</p>
  <ul class="nav">${items}</ul>
  <div class="side-foot">
    <p class="sync">${icon('offline')}<span>${esc(options.sync.label)}</span></p>
    <p class="sync-detail" dir="ltr">${esc(options.sync.lastSync)}</p>
    <p class="sync-pending">${esc(options.sync.pendingLabel)}: <span class="num">${String(options.sync.pending)}</span></p>
    <ul class="langs">${languages}</ul>
  </div>
</nav>
<main id="main" class="main">${options.body}</main>
</div>`;
}

export interface HeaderOptions {
  readonly eyebrow?: string;
  readonly title: string;
  readonly help: string;
  readonly helpLabel: string;
  /** The one primary action for this screen. Rule 9 allows exactly one. */
  readonly action?: string;
  readonly stats?: string;
  readonly tabs?: string;
}

export function screenHeader(options: HeaderOptions): string {
  const eyebrow =
    options.eyebrow === undefined ? '' : `<p class="eyebrow">${esc(options.eyebrow)}</p>`;
  return `<header class="screen-head">
${eyebrow}
<div class="screen-title"><h1>${esc(options.title)}${help(options.help, options.helpLabel)}</h1>${options.action ?? ''}</div>
${options.stats ?? ''}
${options.tabs ?? ''}
</header>`;
}

/**
 * The tab row of a detail screen.
 *
 * Design system rule 16 says one entity is owned by one screen, and this is the
 * shape that keeps that promise: everything an exam can do lives in its own
 * screen and appears nowhere else in the product.
 */
export function tabs(
  items: readonly { href: string; label: string; current: boolean }[],
  label: string,
): string {
  const row = items
    .map(
      (item) =>
        `<a href="${esc(item.href)}" class="tab${item.current ? ' is-current' : ''}"${item.current ? ' aria-current="page"' : ''}>${esc(item.label)}</a>`,
    )
    .join('');
  return `<nav class="tabs" aria-label="${esc(label)}">${row}</nav>`;
}
