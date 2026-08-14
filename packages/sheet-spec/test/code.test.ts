// The printed code. The property that matters is not that the bytes look
// right, it is that a sheet rebuilt from its own code has the same geometry as
// the sheet that was printed. Every test here works toward that one claim.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUBBLE,
  GEOMETRY,
  arabicSymbols,
  base32Decode,
  base32Encode,
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
  timingMarks: layout.timingMarks,
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

  it('prints a smaller code than the same sheet carrying its geometry', () => {
    const full = layoutOf(makeSpec({ code: 'full' }));
    const short = layoutOf(makeSpec({ code: 'short' }));
    expect(short.code.box.wMm).toBeLessThan(full.code.box.wMm);
  });
});

describe('the printed code', () => {
  it('never prints a module below the size a camera can resolve', () => {
    for (const questions of [1, 20, 40]) {
      const layout = layoutOf(makeSpec({ questions: choiceQuestions(questions) }));
      const across = layout.code.modules.length + 2 * GEOMETRY.codeQuietModules;
      expect(layout.code.box.wMm / across).toBeGreaterThanOrEqual(GEOMETRY.codeModuleMm);
    }
  });

  it('grows with what it carries rather than being one fixed size', () => {
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
    expect(mixed.code.box.wMm).toBeGreaterThan(uniform.code.box.wMm);
  });

  it('costs a self describing sheet only a few millimetres over an identifier', () => {
    const full = layoutOf(makeSpec({ code: 'full' })).code.box.wMm;
    const short = layoutOf(makeSpec({ code: 'short' })).code.box.wMm;
    expect(full - short).toBeLessThanOrEqual(4);
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

  it('sits inside the page and clear of the template name band', () => {
    const layout = layoutOf(makeSpec());
    const rightEdgeMm = layout.paper.widthMm - GEOMETRY.marginMm - GEOMETRY.titleBandMm;
    expect(layout.code.box.xMm + layout.code.box.wMm).toBeCloseTo(rightEdgeMm, 6);
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
