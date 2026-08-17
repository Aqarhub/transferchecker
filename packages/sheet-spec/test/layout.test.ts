import { describe, expect, it } from 'vitest';
import {
  GEOMETRY,
  arabicSymbols,
  bubbleGroups,
  layoutSheet,
  letterheadBandMm,
  PAPER,
} from '../src/index';
import { allBubbles, arabicQuestions, choiceQuestions, layoutOrThrow, makeSpec } from './helpers';

describe('layoutSheet geometry', () => {
  it('prints every requested question exactly once', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(37), columns: 3 }));
    const numbers = layout.questionColumns
      .flatMap((column) => column.rows.map((row) => row.question))
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 37 }, (_, i) => i + 1));
  });

  it('fills each column top to bottom before moving to the next', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(40), columns: 2 }));
    const [first, second] = layout.questionColumns;
    expect(first?.rows.map((row) => row.question)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(second?.rows[0]?.question).toBe(21);
  });

  it('fills columns in whole groups and collects the remainder in the tail', () => {
    // Fifty questions, groups of ten: the approved design reads 20 + 20 + 10,
    // never 17 + 17 + 16, so every white break follows a complete group.
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(50) }));
    expect(layout.questionColumns.map((column) => column.rows.length)).toEqual([20, 20, 10]);
  });

  it('breaks a column after every group and nowhere else', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(40), columns: 2 }));
    const rows = layout.questionColumns[0]?.rows ?? [];
    // Row 9 to row 10 is the group boundary: exactly one gap taller than the
    // ordinary pitch, by exactly the group gap.
    const stepAt = (at: number): number =>
      (rows[at + 1]?.bubbles[0]?.cyMm ?? 0) - (rows[at]?.bubbles[0]?.cyMm ?? 0);
    const ordinary = stepAt(0);
    for (let at = 0; at < rows.length - 1; at += 1) {
      const expected = (at + 1) % 10 === 0 ? ordinary + GEOMETRY.groupGapMm : ordinary;
      expect(stepAt(at)).toBeCloseTo(expected, 6);
    }
  });

  it('prints one unbroken column when the teacher turns the breaks off', () => {
    const layout = layoutOrThrow(
      makeSpec({ questions: choiceQuestions(40), columns: 2, groupEvery: 'none' }),
    );
    const rows = layout.questionColumns[0]?.rows ?? [];
    const stepAt = (at: number): number =>
      (rows[at + 1]?.bubbles[0]?.cyMm ?? 0) - (rows[at]?.bubbles[0]?.cyMm ?? 0);
    const ordinary = stepAt(0);
    for (let at = 0; at < rows.length - 1; at += 1) {
      expect(stepAt(at)).toBeCloseTo(ordinary, 6);
    }
  });

  it('gives every question one bubble per choice, each carrying its symbol', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(10, 4), columns: 1 }));
    for (const row of layout.questionColumns.flatMap((column) => column.rows)) {
      expect(row.bubbles.map((bubble) => bubble.symbol)).toEqual(['A', 'B', 'C', 'D']);
    }
  });

  it('labels bubbles in Arabic when the teacher asks for it', () => {
    const layout = layoutOrThrow(makeSpec({ questions: arabicQuestions(4) }));
    const first = layout.questionColumns[0]?.rows[0];
    expect(first?.bubbles.map((bubble) => bubble.symbol)).toEqual(['أ', 'ب', 'ج', 'د']);
  });

  it('keeps all ink inside the printable area', () => {
    const layout = layoutOrThrow(makeSpec());
    const { widthMm, heightMm } = layout.paper;
    for (const bubble of allBubbles(layout)) {
      expect(bubble.cxMm - bubble.rMm).toBeGreaterThanOrEqual(GEOMETRY.marginSideMm);
      expect(bubble.cxMm + bubble.rMm).toBeLessThanOrEqual(widthMm - GEOMETRY.marginSideMm);
      expect(bubble.cyMm - bubble.rMm).toBeGreaterThanOrEqual(GEOMETRY.marginTopMm);
      expect(bubble.cyMm + bubble.rMm).toBeLessThanOrEqual(heightMm - GEOMETRY.marginBottomMm);
    }
  });

  it('never lets two bubbles touch anywhere on the sheet', () => {
    const layout = layoutOrThrow(makeSpec());
    const bubbles = allBubbles(layout);
    for (let i = 0; i < bubbles.length; i += 1) {
      for (let j = i + 1; j < bubbles.length; j += 1) {
        const a = bubbles[i];
        const b = bubbles[j];
        if (a === undefined || b === undefined) continue;
        const distance = Math.hypot(a.cxMm - b.cxMm, a.cyMm - b.cyMm);
        expect(distance).toBeGreaterThan(a.rMm + b.rMm);
      }
    }
  });

  it('reserves the letterhead band and moves the top corners below it', () => {
    const layout = layoutOrThrow(makeSpec());
    expect(layout.letterhead).not.toBeNull();
    const band = layout.letterhead;
    expect(band?.hMm).toBe(letterheadBandMm(PAPER.A4));
    const bandBottom = (band?.yMm ?? 0) + (band?.hMm ?? 0);
    for (const corner of layout.fiducials.slice(0, 2)) {
      expect(corner.yMm - bandBottom).toBeGreaterThanOrEqual(GEOMETRY.letterheadClearMm);
    }
  });

  it('gains the page back when the letterhead is switched off', () => {
    const withBand = layoutOrThrow(makeSpec());
    const without = layoutOrThrow(makeSpec({ letterhead: false }));
    expect(without.letterhead).toBeNull();
    expect(without.fiducials[0]?.yMm).toBe(GEOMETRY.marginTopMm);
    const topOf = (layout: typeof withBand): number =>
      Math.min(
        ...layout.questionColumns.flatMap((c) => c.rows.map((r) => r.bubbles[0]?.cyMm ?? 0)),
      );
    expect(topOf(without)).toBeLessThan(topOf(withBand));
  });

  it('prints no letterhead on the small tiled papers, even when asked', () => {
    const layout = layoutOrThrow(
      makeSpec({ paper: 'A6', questions: choiceQuestions(8, 4), columns: 1, headerFields: [] }),
    );
    expect(layout.letterhead).toBeNull();
    expect(layout.fiducials[0]?.yMm).toBe(GEOMETRY.marginTopMm);
  });

  it('prints the four edge marks at the middle of each edge', () => {
    const layout = layoutOrThrow(makeSpec());
    const { widthMm } = layout.paper;
    const m = GEOMETRY.edgeMarkMm;
    expect(layout.edgeMarks).toHaveLength(4);
    const [left, right, top, bottom] = layout.edgeMarks;
    expect(left?.xMm).toBe(GEOMETRY.marginSideMm);
    expect(right?.xMm).toBe(widthMm - GEOMETRY.marginSideMm - m);
    // Left and right sit halfway between the corner rows.
    const fidTop = layout.fiducials[0];
    const fidBottom = layout.fiducials[2];
    const midY = ((fidTop?.yMm ?? 0) + (fidTop?.hMm ?? 0) + (fidBottom?.yMm ?? 0)) / 2;
    expect((left?.yMm ?? 0) + m / 2).toBeCloseTo(midY, 6);
    expect((right?.yMm ?? 0) + m / 2).toBeCloseTo(midY, 6);
    // Top and bottom sit on the corner rows, centred on the page.
    expect((top?.xMm ?? 0) + m / 2).toBeCloseTo(widthMm / 2, 6);
    expect((bottom?.xMm ?? 0) + m / 2).toBeCloseTo(widthMm / 2, 6);
  });

  it('keeps every edge mark the blank paper its measurement window needs', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(50) }));
    // Every solid box the sheet prints, plus every bubble, as rectangles.
    const boxes = [
      ...layout.fiducials,
      layout.code.box,
      ...layout.writtenFields.map((field) => field.box),
      ...layout.gridFields.map((field) => field.frame),
      ...allBubbles(layout).map((bubble) => ({
        xMm: bubble.cxMm - bubble.rMm,
        yMm: bubble.cyMm - bubble.rMm,
        wMm: 2 * bubble.rMm,
        hMm: 2 * bubble.rMm,
      })),
    ];
    const clear = GEOMETRY.edgeMarkClearMm;
    for (const mark of layout.edgeMarks) {
      for (const box of boxes) {
        const dx = Math.max(box.xMm - (mark.xMm + mark.wMm), mark.xMm - (box.xMm + box.wMm));
        const dy = Math.max(box.yMm - (mark.yMm + mark.hMm), mark.yMm - (box.yMm + box.hMm));
        expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(clear);
      }
    }
  });

  it('puts the identity stack under the tail column on the flagship sheet', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(50) }));
    const tail = layout.questionColumns.at(-1);
    const tailRows = tail?.rows ?? [];
    const tailBottom = Math.max(...tailRows.map((row) => row.bubbles[0]?.cyMm ?? 0));
    const tailLeft = Math.min(...tailRows.flatMap((row) => row.bubbles.map((b) => b.cxMm)));
    for (const field of layout.gridFields) {
      // Below the tail's last row, never beside the columns.
      expect(field.frame.yMm).toBeGreaterThan(tailBottom);
      // And horizontally inside the tail column's slot.
      expect(field.frame.xMm + field.frame.wMm / 2).toBeGreaterThan(
        tailLeft - GEOMETRY.numberGutterMm,
      );
    }
  });

  it('moves a wide identity grid to its own slot instead of the tail', () => {
    // Ten characters at the default pitch are wider than a question column, so
    // the stack takes a slot beside the columns and the sheet drops to fewer
    // of them, which is the owner-approved trade for long student ids.
    const layout = layoutOrThrow(
      makeSpec({
        questions: choiceQuestions(50),
        bubble: { radiusMm: 2, pitchXMm: 5.6, pitchYMm: 6.5, gridPitchYMm: 6 },
        headerFields: [
          { id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox', width: 'large' },
          {
            id: 'studentId',
            usage: 'studentId',
            label: 'Student ID',
            kind: 'bubbleGrid',
            length: 10,
            symbols: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
          },
        ],
      }),
    );
    expect(layout.questionColumns).toHaveLength(2);
    const gridRight = Math.max(
      ...layout.questionColumns.flatMap((column) =>
        column.rows.flatMap((row) => row.bubbles.map((bubble) => bubble.cxMm + bubble.rMm)),
      ),
    );
    for (const field of layout.gridFields) {
      expect(field.frame.xMm).toBeGreaterThan(gridRight);
    }
  });

  it('prints a one character key version as a single short row', () => {
    const layout = layoutOrThrow(
      makeSpec({
        questions: choiceQuestions(50),
        headerFields: [
          { id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox', width: 'large' },
          {
            id: 'studentId',
            usage: 'studentId',
            label: 'Student ID',
            kind: 'bubbleGrid',
            length: 4,
            symbols: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
          },
          {
            id: 'key',
            usage: 'keyVersion',
            label: 'Version',
            kind: 'bubbleGrid',
            length: 1,
            symbols: ['A', 'B', 'C', 'D'],
          },
        ],
      }),
    );
    const key = layout.gridFields.find((field) => field.id === 'key');
    expect(key).toBeDefined();
    // One group of four bubbles on one line, no write boxes.
    expect(key?.columns).toHaveLength(1);
    expect(key?.writeBoxes).toHaveLength(0);
    const ys = new Set(key?.columns[0]?.bubbles.map((bubble) => bubble.cyMm));
    expect(ys.size).toBe(1);
  });

  it('puts the code at the foot, right edge on the corner column', () => {
    const layout = layoutOrThrow(makeSpec());
    const { widthMm } = layout.paper;
    expect(layout.code.box.xMm + layout.code.box.wMm).toBeCloseTo(
      widthMm - GEOMETRY.marginSideMm,
      6,
    );
    const fidBottom = layout.fiducials[2];
    expect((fidBottom?.yMm ?? 0) - (layout.code.box.yMm + layout.code.box.hMm)).toBeCloseTo(
      GEOMETRY.codeBottomClearMm,
      6,
    );
  });

  it('mirrors the header for a right to left sheet', () => {
    const ltr = layoutOrThrow(makeSpec());
    const rtl = layoutOrThrow(makeSpec({ direction: 'rtl' }));
    const nameLtr = ltr.writtenFields.find((field) => field.id === 'name');
    const nameRtl = rtl.writtenFields.find((field) => field.id === 'name');
    // The first field starts at the leading edge of its reading direction.
    expect(nameLtr).toBeDefined();
    expect(nameRtl).toBeDefined();
    expect((nameRtl?.box.xMm ?? 0) + (nameRtl?.box.wMm ?? 0)).toBeGreaterThan(
      (nameLtr?.box.xMm ?? 0) + (nameLtr?.box.wMm ?? 0),
    );
    // The grid itself does not mirror: numbering runs the same way in both.
    expect(rtl.questionColumns[0]?.rows[0]?.question).toBe(1);
  });

  it('anchors the four fiducials clear of the printer dead zone', () => {
    const layout = layoutOrThrow(makeSpec());
    const { widthMm, heightMm } = layout.paper;

    // Defense د1, stated as the numbers it came from: 6.35 mm is the quoted
    // general dead zone and 16.7 mm the worst declared bottom margin of an
    // economy ink jet, so a square inside either is a square that is not
    // printed at all, on every sheet of the stack.
    for (const rect of layout.fiducials) {
      expect(rect.xMm).toBeGreaterThanOrEqual(6.35);
      expect(widthMm - (rect.xMm + rect.wMm)).toBeGreaterThanOrEqual(6.35);
      expect(rect.yMm).toBeGreaterThanOrEqual(6.35);
    }
    const lowestMm = Math.max(...layout.fiducials.map((rect) => rect.yMm + rect.hMm));
    expect(heightMm - lowestMm).toBeGreaterThanOrEqual(16.7);
  });

  it('produces identical geometry for identical input', () => {
    const spec = makeSpec();
    expect(layoutSheet(spec)).toEqual(layoutSheet(spec));
  });
});

describe('layoutSheet capacity', () => {
  it('reports a height overflow instead of running off the page', () => {
    const result = layoutSheet(makeSpec({ questions: choiceQuestions(200), columns: 1 }));
    expect(result).toMatchObject({ kind: 'overflow', area: 'questions', axis: 'height' });
  });

  it('reports a width overflow when too many columns are requested', () => {
    const result = layoutSheet(makeSpec({ questions: choiceQuestions(200, 10), columns: 4 }));
    expect(result).toMatchObject({ kind: 'overflow', area: 'questions', axis: 'width' });
  });

  it('blames the sidebar when a bubbled name cannot fit beside the questions', () => {
    const result = layoutSheet(
      makeSpec({
        columns: 3,
        headerFields: [
          {
            id: 'name',
            usage: 'studentName',
            label: 'Name',
            kind: 'bubbleGrid',
            length: 10,
            symbols: [...arabicSymbols(10)],
          },
        ],
      }),
    );
    expect(result).toMatchObject({ kind: 'overflow', area: 'sidebar', axis: 'width' });
  });

  it('accepts a sheet with no sidebar at all', () => {
    const layout = layoutOrThrow(
      makeSpec({
        headerFields: [
          { id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox', width: 'large' },
        ],
      }),
    );
    expect(layout.gridFields).toHaveLength(0);
    expect(bubbleGroups(layout)).toHaveLength(40);
  });
});
