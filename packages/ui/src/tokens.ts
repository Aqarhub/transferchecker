// The design tokens, loaded from the one file that owns them.
//
// docs/DESIGN-SYSTEM.md names `docs/design/tokens.css` as the source of truth,
// so this reads that file rather than restating it. A second copy of a colour
// is a second colour, and the day they disagree is the day the marketing site
// and the dashboard stop being the same product.
//
// Parsing it also lets `test/contrast.test.ts` compute the real WCAG ratios
// from the real values, so "every pair clears 4.5:1" is a measurement rather
// than a sentence in a document.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function tokensPath(): string {
  return fileURLToPath(new URL('../../../docs/design/tokens.css', import.meta.url));
}

export function tokensCss(): string {
  return readFileSync(tokensPath(), 'utf8');
}

/** Every `--name: #hex` in the file, which is the palette and nothing else. */
export function palette(): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of tokensCss().matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) found.set(name, value.toLowerCase());
  }
  return found;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const clean = hex.replace('#', '');
  // Doubling each digit of the three character form. Written as a replace
  // rather than a spread because a spread over a string is a Unicode operation,
  // and this string is six hex digits or it is not a colour at all.
  const full =
    clean.length === 3 ? clean.replaceAll(/./g, (char) => `${char}${char}`) : clean.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** Relative luminance, per WCAG 2.x. */
function luminance(colour: Rgb): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/** The contrast ratio between two hex colours, or null if either is not one. */
export function contrast(left: string, right: string): number | null {
  const a = hexToRgb(left);
  const b = hexToRgb(right);
  if (a === null || b === null) return null;
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}
