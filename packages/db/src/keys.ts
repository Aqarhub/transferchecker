// The answer key, crossing between the shape `packages/grading` works in and the
// four columns the database holds.
//
// `packages/grading` already owns both halves of this: `toStored` flattens a key
// into the string, the dense points array and the two sparse objects, and
// `fromStored` reads it back and returns null rather than a half key when the
// columns disagree about how many questions there are. Nothing about that
// encoding is re-implemented here. This file only attaches the identifiers the
// row needs and hands the rest straight over, which is what keeps one definition
// of the encoding rather than two that drift.

import { fromStored, toStored } from '@transferchecker/grading';
import type { AnswerKey, StoredKey } from '@transferchecker/grading';
import type { answerKeys } from './schema/answer-keys';

export type AnswerKeyRow = typeof answerKeys.$inferSelect;
export type NewAnswerKeyRow = typeof answerKeys.$inferInsert;

/** The row to write for a key a teacher has just edited. */
export function keyRow(
  key: AnswerKey,
  ids: { readonly id: string; readonly orgId: string; readonly examId: string },
): NewAnswerKeyRow {
  const stored: StoredKey = toStored(key);
  return {
    id: ids.id,
    orgId: ids.orgId,
    examId: ids.examId,
    formCode: stored.form,
    key: stored.key,
    points: [...stored.points],
    extras: stored.extras,
    tags: stored.tags,
  };
}

/**
 * The key a stored row describes, or null when the row cannot describe one.
 *
 * Null rather than a thrown error, and null rather than a partial key: a row
 * whose `key` string and `points` array are different lengths has lost the
 * question count, and guessing which one is right would score a whole class
 * against a key nobody wrote.
 */
export function keyOf(row: AnswerKeyRow): AnswerKey | null {
  return fromStored({
    form: row.formCode,
    key: row.key,
    points: row.points,
    extras: row.extras,
    tags: row.tags,
  });
}
