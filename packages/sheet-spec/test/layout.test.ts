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
      expect(bubble.cxMm - bubble.rMm).toBeGreaterThanOrEqual(GEOMETRY.marginMm);
      expect(bubble.cxMm + bubble.rMm).toBeLessThanOrEqual(widthMm - GEOMETRY.marginMm);
      expect(bubble.cyMm - bubble.rMm).toBeGreaterThanOrEqual(GEOMETRY.marginMm);
      expect(bubble.cyMm + bubble.rMm).toBeLessThanOrEqual(heightMm - GEOMETRY.marginMm);
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
      expect(mark.xMm).toBe(GEOMETRY.marginMm);
    }
  });

  it('anchors the four fiducials to the page corners', () => {
    const layout = layoutOrThrow(makeSpec());
    const { widthMm, heightMm } = layout.paper;
    const { marginMm: m, fiducialMm: f } = GEOMETRY;
    expect(layout.fiducials.map((rect) => [rect.xMm, rect.yMm])).toEqual([
      [m, m],
      [widthMm - m - f, m],
      [m, heightMm - m - f],
      [widthMm - m - f, heightMm - m - f],
    ]);
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
