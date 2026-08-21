// The conversion the importer does, against the conversion the phone does.
//
// The engine never converts colour: it reads a plane. So every producer of a
// plane has to produce the SAME plane a phone would, and until this was measured
// the importer did not. `sharp().greyscale()` is Rec.709 luminance in linear
// light; a phone's Y plane is BT.601 luma on gamma encoded components. They
// agree on grey and diverge on colour, which is why an entirely achromatic
// synthetic corpus could never see it, and why two of the first four real sheets
// being red pen is how it surfaced.
//
// This file cannot run sharp: it is deliberately not a dependency of anything in
// this workspace, and test/tier3.test.ts fails the build if the name appears in
// a package.json or a CI file. So what is tested here is the arithmetic, and the
// fact that the copy of it inside decode-image.mjs has not drifted.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BT601_LUMA, lumaOf } from '../src/image/gray';

const DECODER = readFileSync(
  fileURLToPath(new URL('../tools/decode-image.mjs', import.meta.url)),
  'utf8',
);

/**
 * Solid patches of ink on white office paper, as sRGB bytes, with what
 * `sharp().greyscale()` returned for each [measured through sharp 0.34 on
 * 2026-08-21] beside what a phone's Y plane carries.
 */
const PATCHES = [
  { ink: 'white paper', rgb: [242, 242, 240], greyscale: 242 },
  { ink: 'HB graphite', rgb: [102, 102, 104], greyscale: 102 },
  { ink: 'black ballpoint', rgb: [38, 38, 42], greyscale: 38 },
  { ink: 'blue ballpoint', rgb: [44, 58, 140], greyscale: 66 },
  { ink: 'red ballpoint', rgb: [176, 42, 46], greyscale: 94 },
  { ink: 'red gel', rgb: [206, 32, 48], greyscale: 106 },
] as const;

const at = (rgb: readonly number[], i: number): number => rgb[i] ?? 0;

describe('the plane the importer writes is the plane the phone would', () => {
  it('carries the BT.601 weights, which sum to one', () => {
    expect(BT601_LUMA).toEqual({ r: 0.299, g: 0.587, b: 0.114 });
    expect(BT601_LUMA.r + BT601_LUMA.g + BT601_LUMA.b).toBeCloseTo(1, 10);
  });

  // The copy inside decode-image.mjs cannot be imported: that file is plain
  // JavaScript held outside the tsconfig so that resolving `sharp` never becomes
  // a type check dependency. A silent drift between the two is precisely the
  // defect this whole change exists to close, so the text is checked instead.
  it('keeps the importer and the engine on the same three numbers', () => {
    for (const weight of [BT601_LUMA.r, BT601_LUMA.g, BT601_LUMA.b]) {
      expect([weight, DECODER.includes(String(weight))]).toEqual([weight, true]);
    }
    // And that it is no longer asking the library for its own idea of grey.
    // Comment lines are stripped first: the block explaining WHY greyscale is
    // wrong necessarily names it, and a test that cannot tell an explanation
    // from a call would forbid documenting the defect at all.
    const code = DECODER.split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    expect(code).toContain('recomb');
    expect(code).not.toMatch(/\.greyscale\(\)/);
  });

  it('is the same as a linear light conversion on grey, and is not on colour', () => {
    // The half of the story that explains the silence. If these agreed on
    // colour too there would have been nothing to fix; if they disagreed on
    // grey, the existing corpus would have caught it years earlier.
    for (const patch of PATCHES) {
      const phone = lumaOf(at(patch.rgb, 0), at(patch.rgb, 1), at(patch.rgb, 2));
      const gap = Math.abs(patch.greyscale - phone);
      const achromatic = at(patch.rgb, 0) === at(patch.rgb, 1);
      expect([patch.ink, achromatic ? gap < 1 : gap > 2]).toEqual([patch.ink, true]);
    }
  });

  it('names the size of the error on red, because that is the one that costs a mark', () => {
    const red = PATCHES[5];
    const phone = lumaOf(at(red.rgb, 0), at(red.rgb, 1), at(red.rgb, 2));
    // Twenty grey levels. The engine's own absolute ink floor is eighteen, so
    // the disagreement between the two conversions is larger than the whole
    // margin that separates a mark from paper.
    expect(red.greyscale - phone).toBeGreaterThan(18);
  });
});
