// Behaviour that only exists once questions stopped being uniform.

import { describe, expect, it } from 'vitest';
import { columnWidthMm, latinSymbols, layoutSheet, questionWidthMm } from '../src/index';
import { choiceQuestions, layoutOrThrow, makeSpec } from './helpers';

const noSidebar = [
  { id: 'name', usage: 'studentName' as const, label: 'Name', kind: 'writtenBox' as const },
];

describe('label placement', () => {
  it('makes an external row wider than an internal one', () => {
    const spec = makeSpec();
    const internal = {
      kind: 'choice' as const,
      symbols: [...latinSymbols(5)],
      placement: 'internal' as const,
      select: 'one' as const,
    };
    const external = {
      kind: 'choice' as const,
      symbols: [...latinSymbols(5)],
      placement: 'external' as const,
      select: 'one' as const,
    };
    expect(questionWidthMm(external, spec)).toBeGreaterThan(questionWidthMm(internal, spec));
  });

  it('prints no separate letters when the label sits inside the bubble', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(10, 4, 'internal') }));
    const row = layout.questionColumns[0]?.rows[0];
    expect(row?.choiceLabels).toHaveLength(0);
    expect(row?.bubbles.map((bubble) => bubble.symbol)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('gives every choice its own anchor when the label sits beside the bubble', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(10, 4, 'external') }));
    const row = layout.questionColumns[0]?.rows[0];
    expect(row?.choiceLabels.map((label) => label.symbol)).toEqual(['A', 'B', 'C', 'D']);
    // The letter is printed to the left of the bubble it belongs to.
    for (const [index, label] of (row?.choiceLabels ?? []).entries()) {
      const bubble = row?.bubbles[index];
      expect(bubble).toBeDefined();
      if (bubble === undefined) continue;
      expect(label.anchor.xMm).toBeLessThan(bubble.cxMm);
      expect(label.anchor.yMm).toBe(bubble.cyMm);
    }
  });
});

describe('heterogeneous questions', () => {
  it('places a sheet that mixes five choices with true and false', () => {
    const layout = layoutOrThrow(
      makeSpec({
        headerFields: noSidebar,
        questions: [
          { kind: 'choice', symbols: [...latinSymbols(5)] },
          { kind: 'choice', symbols: ['T', 'F'] },
          { kind: 'choice', symbols: [...latinSymbols(5)] },
        ],
      }),
    );
    const rows = layout.questionColumns.flatMap((column) => column.rows);
    expect(rows.map((row) => row.bubbles.length)).toEqual([5, 2, 5]);
  });

  it('gives every column the width of the widest question, so bubbles stay on a grid', () => {
    const spec = makeSpec({
      headerFields: noSidebar,
      questions: [
        { kind: 'choice', symbols: ['T', 'F'] },
        { kind: 'choice', symbols: [...latinSymbols(5)] },
      ],
    });
    const widest = {
      kind: 'choice' as const,
      symbols: [...latinSymbols(5)],
      placement: 'internal' as const,
      select: 'one' as const,
    };
    expect(columnWidthMm(spec)).toBe(questionWidthMm(widest, spec));
  });

  it('starts every row at the same left edge regardless of choice count', () => {
    const layout = layoutOrThrow(
      makeSpec({
        headerFields: noSidebar,
        questions: [
          { kind: 'choice', symbols: ['T', 'F'] },
          { kind: 'choice', symbols: [...latinSymbols(5)] },
        ],
      }),
    );
    const rows = layout.questionColumns.flatMap((column) => column.rows);
    const firstBubbleXs = rows.map((row) => row.bubbles[0]?.cxMm);
    expect(new Set(firstBubbleXs).size).toBe(1);
  });
});

describe('automatic column count', () => {
  it('uses one column when a few questions fit in one', () => {
    const layout = layoutOrThrow(
      makeSpec({ questions: choiceQuestions(10), headerFields: noSidebar }),
    );
    expect(layout.questionColumns).toHaveLength(1);
  });

  it('adds columns only when the questions no longer fit vertically', () => {
    const layout = layoutOrThrow(
      makeSpec({ questions: choiceQuestions(60), headerFields: noSidebar }),
    );
    expect(layout.questionColumns.length).toBeGreaterThan(1);
  });

  it('fits fewer questions on a page when the labels sit outside', () => {
    // Wider rows mean fewer columns fit across the page, so a count that is
    // comfortable with internal labels runs out of room with external ones.
    const questions = 90;
    expect(
      layoutSheet(
        makeSpec({ questions: choiceQuestions(questions, 5, 'internal'), headerFields: noSidebar }),
      ),
    ).toMatchObject({ kind: 'ok' });
    expect(
      layoutSheet(
        makeSpec({ questions: choiceQuestions(questions, 5, 'external'), headerFields: noSidebar }),
      ),
    ).toMatchObject({ kind: 'overflow', area: 'questions' });
  });

  it('still reports an overflow when nothing fits at any column count', () => {
    const result = layoutSheet(
      makeSpec({ questions: choiceQuestions(200, 10, 'external'), headerFields: noSidebar }),
    );
    expect(result).toMatchObject({ kind: 'overflow', area: 'questions' });
  });

  it('honours a fixed column count when the teacher sets one', () => {
    const layout = layoutOrThrow(
      makeSpec({ questions: choiceQuestions(40), columns: 2, headerFields: noSidebar }),
    );
    expect(layout.questionColumns).toHaveLength(2);
  });
});
