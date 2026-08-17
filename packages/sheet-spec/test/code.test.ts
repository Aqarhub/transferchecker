// The printed code. The property that matters is not that the bytes look
// right, it is that a sheet rebuilt from its own code has the same geometry as
// the sheet that was printed. Every test here works toward that one claim.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUBBLE,
  GEOMETRY,
  LABEL_PLACEMENTS,
  PAPER_NAMES,
  SELECT_MODES,
  arabicSymbols,
  base32Decode,
  base32Encode,
  codeModuleMmFor,
  decodeSheetCode,
  digitSymbols,
  encodeSheetBytes,
  encodeSheetCode,
  latinSymbols,
  layoutSheet,
  trueFalseSymbols,
} from '../src/index';
import type { SheetLayout } from '../src/index';
import { arabicQuestions, choiceQuestions, makeSpec } from './helpers';

const ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]*$/;

/** Everything the scanner samples, with the code itself left out. */
const geometryOf = (layout: SheetLayout): unknown => ({
  paper: layout.paper,
  fiducials: layout.fiducials,
  edgeMarks: layout.edgeMarks,
  writtenFields: layout.writtenFields.map((field) => field.box),
  gridFields: layout.gridFields.map((field) => field.columns),
  questionColumns: layout.questionColumns,
});

const layoutOf = (spec: Parameters<typeof layoutSheet>[0]): SheetLayout => {
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') throw new Error(`did not fit: ${result.axis} in ${result.area}`);
  return result.layout;
};

describe('base32', () => {
  it('round trips every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('stays inside the character set a QR can pack two per eleven bits', () => {
    const bytes = Uint8Array.from({ length: 200 }, (_, index) => (index * 37) % 256);
    expect(base32Encode(bytes)).toMatch(ALPHANUMERIC);
  });

  it('refuses a character that is not in the alphabet', () => {
    expect(base32Decode('AAAA1AAA')).toBeNull();
  });

  it('refuses trailing bits that were not padded with zeroes', () => {
    // One character carries five bits, none of which can form a byte.
    expect(base32Decode('B')).toBeNull();
  });
});

describe('a sheet that carries its whole geometry', () => {
  it('rebuilds a layout identical to the one that was printed', () => {
    const spec = makeSpec();
    const decoded = decodeSheetCode(encodeSheetCode(spec));
    expect(decoded?.mode).toBe('full');
    if (decoded?.mode !== 'full') return;
    expect(geometryOf(layoutOf(decoded.spec))).toEqual(geometryOf(layoutOf(spec)));
  });

  it('rebuilds it for Arabic symbols, external labels and a fixed column count', () => {
    const spec = makeSpec({
      questions: [
        ...arabicQuestions(4, 10),
        ...choiceQuestions(10, 4, 'external'),
        ...choiceQuestions(10, 2),
      ],
      columns: 2,
      paper: 'LETTER',
    });
    const decoded = decodeSheetCode(encodeSheetCode(spec));
    if (decoded?.mode !== 'full') throw new Error('expected a full code');
    expect(geometryOf(layoutOf(decoded.spec))).toEqual(geometryOf(layoutOf(spec)));
  });

  it('carries every paper size, not only the two the first format could hold', () => {
    // This is the test whose absence let a real defect through. Format 1 gave
    // the paper a single bit, so A5 decoded as A4 and A6 as LETTER: a sheet
    // rebuilt its geometry against a page size it was never printed on, and
    // two of the three stock templates are not A4. Every name, or nothing.
    for (const paper of PAPER_NAMES) {
      const spec = makeSpec({
        paper,
        questions: choiceQuestions(4, 4),
        headerFields: [],
      });
      const decoded = decodeSheetCode(encodeSheetCode(spec));
      expect(`${paper}: ${String(decoded?.mode)}`).toBe(`${paper}: full`);
      if (decoded?.mode !== 'full') continue;
      expect(`${paper} decodes as ${decoded.spec.paper}`).toBe(`${paper} decodes as ${paper}`);
    }
  });

  it('carries every label placement, not only the two that fitted one bit', () => {
    // The second defect of exactly the same shape, in the same byte layout, and
    // just as silent. LABEL_PLACEMENTS has THREE members and the question flags
    // gave placement one bit, so 'header' encoded as 0 and decoded as
    // 'internal'. A 'header' sheet prints a row of choice letters above each
    // column, so the whole grid moves: measured at 3.8 mm on the first bubble
    // of a 40 question A4 sheet, and about 11 mm by the twentieth row.
    //
    // The assertion is on the REBUILT GEOMETRY and not only on the field,
    // because the field is a means and the millimetres are the end.
    for (const placement of LABEL_PLACEMENTS) {
      for (const select of SELECT_MODES) {
        const spec = makeSpec({
          questions: Array.from({ length: 40 }, () => ({
            kind: 'choice' as const,
            symbols: [...latinSymbols(4)],
            placement,
            select,
          })),
        });
        const decoded = decodeSheetCode(encodeSheetCode(spec));
        const label = `${placement}/${select}`;
        expect(`${label}: ${String(decoded?.mode)}`).toBe(`${label}: full`);
        if (decoded?.mode !== 'full') continue;

        expect(`${label} placement ${String(decoded.spec.questions[0]?.placement)}`).toBe(
          `${label} placement ${placement}`,
        );
        expect(`${label} select ${String(decoded.spec.questions[0]?.select)}`).toBe(
          `${label} select ${select}`,
        );
        expect(geometryOf(layoutOf(decoded.spec))).toEqual(geometryOf(layoutOf(spec)));
      }
    }
  });

  it('leaves room in the geometry byte for the paper sizes it may still gain', () => {
    // Three bits. A seventh and eighth name may be appended, and a ninth needs
    // a new CODE_FORMAT rather than a silent truncation.
    expect(PAPER_NAMES.length).toBeLessThanOrEqual(8);
  });

  it('carries the symbols themselves, not only how many there are', () => {
    const spec = makeSpec({ questions: arabicQuestions(4, 10) });
    const decoded = decodeSheetCode(encodeSheetCode(spec));
    if (decoded?.mode !== 'full') throw new Error('expected a full code');
    expect(decoded.spec.questions[0]?.symbols).toEqual([...arabicSymbols(4)]);
  });

  it('carries symbols a teacher typed that match no preset', () => {
    const symbols = ['◆', '★', '⬟'];
    const spec = makeSpec({ questions: [{ kind: 'choice', symbols }] });
    const decoded = decodeSheetCode(encodeSheetCode(spec));
    if (decoded?.mode !== 'full') throw new Error('expected a full code');
    expect(decoded.spec.questions[0]?.symbols).toEqual(symbols);
  });

  it('carries what a field means, since that is what the scanner acts on', () => {
    const decoded = decodeSheetCode(encodeSheetCode(makeSpec()));
    if (decoded?.mode !== 'full') throw new Error('expected a full code');
    expect(decoded.spec.headerFields.map((field) => field.usage)).toEqual([
      'studentName',
      'class',
      'studentId',
    ]);
  });

  it('carries check all that apply, so a scanner knows a second mark is an answer', () => {
    const spec = makeSpec({
      questions: [{ kind: 'choice', symbols: [...latinSymbols(4)], select: 'many' }],
    });
    const decoded = decodeSheetCode(encodeSheetCode(spec));
    if (decoded?.mode !== 'full') throw new Error('expected a full code');
    expect(decoded.spec.questions[0]?.select).toBe('many');
  });

  it('keeps the template id, which is what ties a paper to its exam', () => {
    const spec = makeSpec();
    expect(decodeSheetCode(encodeSheetCode(spec))?.templateId).toBe(spec.templateId);
  });
});

describe('a sheet that carries only an identifier', () => {
  it('decodes to the template id and nothing else', () => {
    const spec = makeSpec({ code: 'short' });
    const decoded = decodeSheetCode(encodeSheetCode(spec));
    expect(decoded).toEqual({ mode: 'short', templateId: spec.templateId });
  });

  it('is seventeen bytes whatever the sheet holds', () => {
    const small = makeSpec({ code: 'short', questions: choiceQuestions(1) });
    const large = makeSpec({ code: 'short', questions: choiceQuestions(200) });
    expect(encodeSheetBytes(small)).toHaveLength(17);
    expect(encodeSheetBytes(large)).toHaveLength(17);
  });

  it('prints fewer and therefore larger modules than the same sheet carrying its geometry', () => {
    const full = layoutOf(makeSpec({ code: 'full' }));
    const short = layoutOf(makeSpec({ code: 'short' }));
    expect(short.code.modules.length).toBeLessThan(full.code.modules.length);

    // What 'short' buys changed with defense د6. Both codes now spend the same
    // budget of paper, so the identifier does not print a smaller box: it
    // prints the same box at a coarser pitch, which is robustness rather than
    // saved millimetres. The teacher's trade is real either way.
    const moduleMm = (code: typeof full.code): number =>
      code.box.wMm / (code.modules.length + 2 * GEOMETRY.codeQuietModules);
    expect(moduleMm(short.code)).toBeGreaterThan(moduleMm(full.code));
  });
});

describe('the printed code', () => {
  it('never prints a module below the size a camera can resolve', () => {
    for (const questions of [1, 20, 40]) {
      const layout = layoutOf(makeSpec({ questions: choiceQuestions(questions) }));
      const across = layout.code.modules.length + 2 * GEOMETRY.codeQuietModules;
      expect(layout.code.box.wMm / across).toBeGreaterThanOrEqual(GEOMETRY.codeMinModuleMm);
    }
  });

  it('spends the whole budget it is given rather than the minimum it could', () => {
    // Defense د6. The module used to be pinned at 0.5 mm against a 30 mm
    // budget, so a small payload printed a fragile code and left the spare
    // millimetres as white paper. Every sheet here comes within one rounding
    // step of the budget, and none exceeds it.
    for (const questions of [1, 20, 40]) {
      const layout = layoutOf(makeSpec({ questions: choiceQuestions(questions) }));
      const across = layout.code.modules.length + 2 * GEOMETRY.codeQuietModules;
      expect(layout.code.box.wMm).toBeLessThanOrEqual(GEOMETRY.codeMaxSizeMm);
      expect(layout.code.box.wMm).toBeGreaterThan(GEOMETRY.codeMaxSizeMm - 0.01 * across);
      expect(layout.code.box.wMm / across).toBeGreaterThan(GEOMETRY.codeMinModuleMm);
    }
  });

  it('derives the printed module from the one function both sides call', () => {
    // The scanner rebuilds the module size for each module count it tries, so a
    // second implementation of this arithmetic anywhere is a sheet the engine
    // that printed it cannot read.
    for (const questions of [1, 20, 40]) {
      const layout = layoutOf(makeSpec({ questions: choiceQuestions(questions) }));
      const count = layout.code.modules.length;
      const across = count + 2 * GEOMETRY.codeQuietModules;
      expect(layout.code.box.wMm).toBeCloseTo(across * codeModuleMmFor(count), 9);
    }
  });

  it('spends a larger payload on more modules rather than on more paper', () => {
    const uniform = layoutOf(makeSpec({ questions: choiceQuestions(40) }));
    // Ten runs instead of one, because a run is what the payload spends bytes on.
    const mixed = layoutOf(
      makeSpec({
        questions: Array.from({ length: 40 }, (_, index) => ({
          kind: 'choice' as const,
          symbols: [...latinSymbols(2 + (Math.floor(index / 4) % 5))],
        })),
      }),
    );
    expect(mixed.code.modules.length).toBeGreaterThan(uniform.code.modules.length);
    // The box is the budget either way since defense د6, so what a heavier
    // payload costs is module size and not page.
    expect(mixed.code.box.wMm).toBeLessThanOrEqual(GEOMETRY.codeMaxSizeMm);
  });

  it('costs a self describing sheet only a fraction of a module over an identifier', () => {
    const full = layoutOf(makeSpec({ code: 'full' })).code;
    const short = layoutOf(makeSpec({ code: 'short' })).code;
    const moduleMm = (code: typeof full): number =>
      code.box.wMm / (code.modules.length + 2 * GEOMETRY.codeQuietModules);
    expect(moduleMm(short) - moduleMm(full)).toBeLessThanOrEqual(0.25);
    // Both still clear the 0.5 mm floor, which is what makes the full code
    // the default: carrying the whole geometry is what lets a device that has
    // never seen the template grade the paper. The margin narrowed when the
    // budget went from 30 mm to 24 in version 5, and that trade was taken
    // deliberately: the foot line's height is paid for by question rows.
    expect(moduleMm(full)).toBeGreaterThanOrEqual(0.6);
  });

  it('refuses a sheet whose geometry cannot fit a readable code', () => {
    // Two hundred questions, each with its own hand typed alphabet, is a
    // payload no code this size can carry. Reporting it is the right answer.
    const questions = Array.from({ length: 200 }, (_, index) => ({
      kind: 'choice' as const,
      symbols: [String.fromCodePoint(0x4e00 + index), String.fromCodePoint(0x5e00 + index)],
    }));
    expect(layoutSheet(makeSpec({ questions }))).toMatchObject({
      kind: 'overflow',
      area: 'code',
    });
  });

  it('sits at the foot with its right edge on the corner column', () => {
    // A fixed offset from the bottom-right corner square is what lets the
    // scanner put a window over the code before it knows the paper size.
    const layout = layoutOf(makeSpec());
    expect(layout.code.box.xMm + layout.code.box.wMm).toBeCloseTo(
      layout.paper.widthMm - GEOMETRY.marginSideMm,
      6,
    );
    const bottomCorner = layout.fiducials[2];
    expect((bottomCorner?.yMm ?? 0) - (layout.code.box.yMm + layout.code.box.hMm)).toBeCloseTo(
      GEOMETRY.codeBottomClearMm,
      6,
    );
  });
});

describe('a damaged read', () => {
  const good = encodeSheetCode(makeSpec());

  it('is rejected rather than turned into a plausible sheet', () => {
    expect(decodeSheetCode(good.slice(0, good.length - 4))).toBeNull();
    expect(decodeSheetCode(`${good}AAAA`)).toBeNull();
    expect(decodeSheetCode('')).toBeNull();
  });

  it('is rejected when the format number is not one this build knows', () => {
    const bytes = encodeSheetBytes(makeSpec());
    bytes[0] = 0x9f;
    expect(decodeSheetCode(base32Encode(bytes))).toBeNull();
  });

  it('is rejected when a symbol count is outside what a sheet may print', () => {
    const bytes = encodeSheetBytes(makeSpec({ questions: choiceQuestions(4) }));
    // The last byte of a preset run is its symbol descriptor.
    bytes[bytes.length - 1] = 0x11;
    expect(decodeSheetCode(base32Encode(bytes))).toBeNull();
  });
});

describe('symbol presets in the code', () => {
  it('spends one byte on a preset and more on a typed set', () => {
    const preset = encodeSheetBytes(
      makeSpec({ questions: [{ kind: 'choice', symbols: [...trueFalseSymbols()] }] }),
    );
    const typed = encodeSheetBytes(
      makeSpec({ questions: [{ kind: 'choice', symbols: ['ص', 'خ'] }] }),
    );
    expect(typed.length).toBeGreaterThan(preset.length);
  });

  it('recognises a digit grid as a preset however long the field is', () => {
    const spec = makeSpec({
      headerFields: [
        {
          id: 'studentId',
          usage: 'studentId',
          label: 'Student ID',
          kind: 'bubbleGrid',
          length: 6,
          symbols: [...digitSymbols()],
        },
      ],
    });
    const decoded = decodeSheetCode(encodeSheetCode(spec));
    if (decoded?.mode !== 'full') throw new Error('expected a full code');
    expect(decoded.spec.headerFields[0]).toMatchObject({
      kind: 'bubbleGrid',
      length: 6,
      symbols: [...digitSymbols()],
    });
  });
});

describe('bubble metrics in the code', () => {
  it('survives the round trip exactly, not as a rounded copy', () => {
    const spec = makeSpec({ bubble: { ...DEFAULT_BUBBLE, radiusMm: 2.5, pitchXMm: 7.1 } });
    const decoded = decodeSheetCode(encodeSheetCode(spec));
    if (decoded?.mode !== 'full') throw new Error('expected a full code');
    expect(decoded.spec.bubble).toEqual(spec.bubble);
  });
});
