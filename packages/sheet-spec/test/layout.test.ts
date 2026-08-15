import { describe, expect, it } from 'vitest';
import { GEOMETRY, arabicSymbols, bubbleGroups, layoutSheet } from '../src/index';
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

  it('drops trailing columns that would print empty', () => {
    const layout = layoutOrThrow(
      makeSpec({
        questions: choiceQuestions(3, 4),
        columns: 4,
        headerFields: [
          { id: 'name', usage: 'studentName', label: 'Name', kind: 'writtenBox', width: 'medium' },
        ],
      }),
    );
    expect(layout.questionColumns).toHaveLength(3);
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

  it('keeps the question grid clear of the sidebar', () => {
    const layout = layoutOrThrow(makeSpec());
    const gridRight = Math.max(
      ...layout.questionColumns.flatMap((column) =>
        column.rows.flatMap((row) => row.bubbles.map((bubble) => bubble.cxMm + bubble.rMm)),
      ),
    );
    const sidebarLeft = Math.min(...layout.gridFields.map((field) => field.frame.xMm));
    expect(gridRight).toBeLessThan(sidebarLeft);
  });

  it('puts one timing mark on the left edge for each grid row', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(40), columns: 2 }));
    expect(layout.timingMarks).toHaveLength(20);
    for (const mark of layout.timingMarks) {
      expect(mark.xMm).toBe(GEOMETRY.marginSideMm);
      expect(mark.hMm).toBe(GEOMETRY.timingHeightMm);
    }
  });

  it('leaves every timing mark the blank paper defense د3 asks for', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(40), columns: 2 }));
    const stripRightMm = GEOMETRY.marginSideMm + GEOMETRY.timingWidthMm;

    // Everything the sheet prints to the right of the timing strip, taken from
    // the layout rather than assumed: bubbles, the boxes of both kinds of
    // field, the code, and both vertical text bands. The question number is not
    // here because it is printed inside its column's own gutter, which starts
    // at the leftmost bubble's left edge minus the gutter width.
    const inkLeftMm = [
      ...allBubbles(layout).map((bubble) => bubble.cxMm - bubble.rMm - GEOMETRY.numberGutterMm),
      ...layout.writtenFields.map((field) => field.box.xMm),
      ...layout.gridFields.map((field) => field.frame.xMm),
      layout.code.box.xMm,
      layout.branding.band.xMm,
      layout.title.band.xMm,
      ...layout.anchorColumns.map((column) => column.xMm - GEOMETRY.anchorWidthMm / 2),
    ];

    expect(Math.min(...inkLeftMm) - stripRightMm).toBeGreaterThanOrEqual(GEOMETRY.timingClearMm);
  });

  it('gives every anchor column a mark on every row', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(40), columns: 2 }));
    expect(layout.anchorColumns.length).toBeGreaterThan(0);
    for (const column of layout.anchorColumns) {
      expect(column.marks).toHaveLength(layout.timingMarks.length);
      // Locked to the rows in y by construction, which is the property that
      // makes the anchor a measurement of x and of nothing else.
      for (const [row, mark] of column.marks.entries()) {
        expect(mark.yMm).toBe(layout.timingMarks[row]?.yMm);
        expect(mark.hMm).toBe(GEOMETRY.timingHeightMm);
        expect(mark.xMm + mark.wMm / 2).toBeCloseTo(column.xMm, 9);
      }
    }
  });

  it('puts an anchor between two question columns, where the corners pin nothing', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(40), columns: 2 }));
    const first = layout.questionColumns[0]?.rows[0]?.bubbles.at(-1);
    const second = layout.questionColumns[1]?.rows[0]?.bubbles[0];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const inGap = layout.anchorColumns.filter(
      (column) => column.xMm > (first?.cxMm ?? 0) && column.xMm < (second?.cxMm ?? 0),
    );
    expect(inGap).toHaveLength(1);
  });

  it('anchors every sheet that lays out, one column or many', () => {
    // A one column sheet has no gap to put a mark in, and it is the commonest
    // small sheet, so leaving it with no evidence in x would leave the hole
    // where it is widest. The band beside the grid is where its anchor goes,
    // and the band is guaranteed: a layout is refused unless what is left after
    // the grid is at least `sidebarGapMm` wide.
    for (const [columns, questions, paper] of [
      [1, 10, 'A4'],
      [1, 6, 'A5'],
      [2, 40, 'A4'],
      [3, 60, 'A4'],
      [2, 30, 'LETTER'],
    ] as const) {
      const layout = layoutOrThrow(
        makeSpec({ questions: choiceQuestions(questions), columns, paper }),
      );
      expect(layout.anchorColumns.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps every anchor mark clear of the ink on either side of it', () => {
    for (const [columns, questions] of [
      [1, 20],
      [2, 40],
    ] as const) {
      const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(questions), columns }));
      // Every edge of printed ink the anchor could meet: bubbles on both sides,
      // and the frame of the sidebar the trailing band ends at.
      const edges = [
        ...allBubbles(layout).flatMap((bubble) => [
          { leftMm: bubble.cxMm - bubble.rMm, rightMm: bubble.cxMm + bubble.rMm },
        ]),
        ...layout.gridFields.map((field) => ({
          leftMm: field.frame.xMm,
          rightMm: field.frame.xMm + field.frame.wMm,
        })),
      ];

      for (const column of layout.anchorColumns) {
        const leftMm = column.xMm - GEOMETRY.anchorWidthMm / 2;
        const rightMm = column.xMm + GEOMETRY.anchorWidthMm / 2;
        const before = Math.max(
          ...edges.map((edge) => edge.rightMm).filter((edge) => edge <= leftMm),
        );
        const after = Math.min(
          ...edges.map((edge) => edge.leftMm).filter((edge) => edge >= rightMm),
        );
        expect(leftMm - before).toBeGreaterThanOrEqual(GEOMETRY.anchorClearMm);
        expect(after - rightMm).toBeGreaterThanOrEqual(GEOMETRY.anchorClearMm);
      }
    }
  });

  it('leaves both blank bands wide enough for a mark and its clearance', () => {
    // The gap between columns and the band left of the sidebar are the two
    // places an anchor is printed. Neither is checked at run time, because the
    // layout would have nowhere to report it, so they are checked here: below
    // either number, sheets silently lose their only evidence in x.
    const neededMm = GEOMETRY.anchorWidthMm + 2 * GEOMETRY.anchorClearMm;
    expect(GEOMETRY.columnGapMm).toBeGreaterThanOrEqual(neededMm);
    expect(GEOMETRY.sidebarGapMm).toBeGreaterThanOrEqual(neededMm);
  });

  it('anchors the four fiducials clear of the printer dead zone', () => {
    const layout = layoutOrThrow(makeSpec());
    const { widthMm, heightMm } = layout.paper;
    const {
      marginTopMm: top,
      marginSideMm: side,
      marginBottomMm: bottom,
      fiducialMm: f,
    } = GEOMETRY;
    expect(layout.fiducials.map((rect) => [rect.xMm, rect.yMm])).toEqual([
      [side, top],
      [widthMm - side - f, top],
      [side, heightMm - bottom - f],
      [widthMm - side - f, heightMm - bottom - f],
    ]);

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
            length: 12,
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
