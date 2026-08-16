// "Every pair clears 4.5:1" as a measurement rather than a sentence.
//
// docs/DESIGN-SYSTEM.md section 1 ends with that claim and with the reason the
// identity colour is petrol: it sits outside the green, red and amber ranges, so
// it is never misread as a grading result. Both halves are checked here from
// `docs/design/tokens.css` itself, which is the named source of truth, so a
// colour edited in that file either still clears the floor or fails the build.
//
// WCAG 2.x contrast is the ratio used because it is the one the criteria are
// written against. It is a poor model of perceived contrast, and APCA is the
// better one, and none of that matters here: the obligation is stated in the
// standard's terms and a product is measured against the standard.

import { describe, expect, it } from 'vitest';
import { contrast, hexToRgb, palette } from '../src/tokens';

const AA_TEXT = 4.5;
/** WCAG 1.4.11: a control boundary or a meaningful graphic clears 3:1. */
const AA_LARGE = 3;

const value = (name: string): string => {
  const found = palette().get(name);
  if (found === undefined) throw new Error(`token --${name} is missing`);
  return found;
};

const ratio = (fore: string, back: string): number => {
  const found = contrast(value(fore), value(back));
  if (found === null) throw new Error(`--${fore} on --${back} is not a colour`);
  return found;
};

describe('the palette is loaded from the file that owns it', () => {
  it('finds every token the design system names', () => {
    const names = palette();
    for (const token of [
      'pearl',
      'surface',
      'surface-sunk',
      'graphite',
      'graphite-2',
      'hairline',
      'ink',
      'correct',
      'wrong',
      'review',
    ]) {
      expect(names.has(token), token).toBe(true);
      expect(hexToRgb(value(token)), token).not.toBeNull();
    }
  });
});

describe('every text pair clears 4.5:1, measured', () => {
  it('reads body and secondary text on both backgrounds', () => {
    for (const back of ['pearl', 'surface', 'surface-sunk']) {
      for (const fore of ['graphite', 'graphite-2']) {
        expect(ratio(fore, back), `--${fore} on --${back}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it('reads the identity colour, and white on it', () => {
    for (const back of ['pearl', 'surface', 'ink-wash']) {
      expect(ratio('ink', back), `--ink on --${back}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
    // The primary button is white on petrol, which is the one pair not made of
    // two tokens.
    const onInk = contrast('#ffffff', value('ink'));
    expect(onInk ?? 0).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('reads all three result colours on every surface they appear on', () => {
    // These carry a grade. A teacher reading a mark on a phone in a classroom
    // is the least forgiving reading condition in the product.
    for (const back of ['pearl', 'surface']) {
      for (const fore of ['correct', 'wrong', 'review']) {
        expect(ratio(fore, back), `--${fore} on --${back}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });
});

describe('the identity colour cannot be mistaken for a result', () => {
  it('separates petrol from all three result colours', () => {
    // Section 1's stated reason for choosing petrol. A green identity colour
    // would only have to confuse a teacher once, at the moment they read a mark.
    for (const result of ['correct', 'wrong', 'review']) {
      const separation = contrast(value('ink'), value(result)) ?? 1;
      expect(separation, `--ink against --${result}`).not.toBe(1);
    }
    const ink = hexToRgb(value('ink'));
    const correct = hexToRgb(value('correct'));
    expect(ink).not.toBeNull();
    expect(correct).not.toBeNull();
    // Petrol is blue dominant, the result green is green dominant. Stated as a
    // channel fact so that a future "let us warm up the brand" fails here.
    if (ink !== null) expect(ink.b).toBeGreaterThan(ink.g);
    if (correct !== null) expect(correct.g).toBeGreaterThan(correct.b);
  });
});

describe('the hairline is a hairline and not a border', () => {
  it('stays under the text floor deliberately', () => {
    // Rule 5: separation comes from the surface pair. A divider that cleared
    // 4.5:1 would be a grey box around everything, which is the look the rule
    // exists to prevent. It does have to be visible, so 1.4.11 applies at 3:1
    // only where it carries meaning, and a decorative rule does not.
    expect(ratio('hairline', 'surface')).toBeLessThan(AA_LARGE);
    expect(ratio('hairline', 'surface')).toBeGreaterThan(1);
  });
});

describe('the maths itself', () => {
  it('agrees with the two ratios everyone knows', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('expands the three character form and refuses anything else', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#0F3D52')).toEqual({ r: 15, g: 61, b: 82 });
    expect(hexToRgb('rebeccapurple')).toBeNull();
    expect(contrast('#zzz', '#ffffff')).toBeNull();
  });
});
