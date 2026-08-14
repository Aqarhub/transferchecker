import { describe, expect, it } from 'vitest';
import { bubbleGroups, fieldGroupId, questionGroupId } from '../src/index';
import { choiceQuestions, layoutOrThrow, makeSpec } from './helpers';

describe('bubbleGroups', () => {
  it('emits one group per question and one per grid character column', () => {
    const layout = layoutOrThrow(makeSpec({ questions: choiceQuestions(40), columns: 2 }));
    // Forty questions plus the four digit columns of the student id grid.
    expect(bubbleGroups(layout)).toHaveLength(44);
  });

  it('gives every group a unique identifier', () => {
    const layout = layoutOrThrow(makeSpec());
    const ids = bubbleGroups(layout).map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names groups so the scanner can address them without extra context', () => {
    const layout = layoutOrThrow(makeSpec());
    const ids = bubbleGroups(layout).map((group) => group.id);
    expect(ids).toContain(questionGroupId(1));
    expect(ids).toContain(questionGroupId(40));
    expect(ids).toContain(fieldGroupId('studentId', 3));
  });

  it('carries the digits a student id column can represent', () => {
    const layout = layoutOrThrow(makeSpec());
    const groups = bubbleGroups(layout);
    const column = groups.find((group) => group.id === fieldGroupId('studentId', 0));
    expect(column?.bubbles.map((bubble) => bubble.symbol)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
  });

  it('keeps question groups aligned with the printed choice letters', () => {
    const layout = layoutOrThrow(makeSpec());
    const groups = bubbleGroups(layout);
    const question = groups.find((group) => group.id === questionGroupId(7));
    expect(question?.bubbles.map((bubble) => bubble.symbol)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});
