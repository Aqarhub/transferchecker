// Flattens a layout into the units the scanner actually scores.
//
// A group is a set of bubbles of which at most one may be shaded. The scanner
// walks groups without knowing whether it is reading an answer, a student id
// digit or a bubbled name, which keeps the reading code free of special cases.

import type { BubbleGroup, SheetLayout } from './types';

/** Stable identifier for the group holding question `n`. */
export function questionGroupId(question: number): string {
  return `q:${String(question)}`;
}

/** Stable identifier for character `column` of the field `fieldId`. */
export function fieldGroupId(fieldId: string, column: number): string {
  return `f:${fieldId}:${String(column)}`;
}

export function bubbleGroups(layout: SheetLayout): readonly BubbleGroup[] {
  const questions = layout.questionColumns.flatMap((column) =>
    column.rows.map((row) => ({
      id: questionGroupId(row.question),
      bubbles: row.bubbles,
    })),
  );

  const fields = layout.gridFields.flatMap((field) =>
    field.columns.map((column) => ({
      id: fieldGroupId(field.id, column.index),
      bubbles: column.bubbles,
    })),
  );

  return [...questions, ...fields];
}
