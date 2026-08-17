// The download half: everything that changed since a cursor, and the deletions.
//
// PLAN section 6 asks for delta sync rather than pulling everything, and the two
// things that make a delta correct rather than merely small are both in
// `cursor.ts`: the cursor is a keyset so a page may stop inside a tie, and it is
// rewound on every read so a transaction that committed late is not skipped
// forever. Re-delivery is harmless because applying a row is an upsert.
//
// AND A DELETION IS A CHANGE. A removed row is simply absent, which is what a
// row the client never had also looks like, so the tombstones written by the
// trigger travel in the same answer and on the same clock.
//
// MUST BE CALLED INSIDE `asTenant`. No query here names an organisation: the
// isolation policy does, from the verified token. A caller who forgets the
// wrapper reads nothing rather than reading somebody else's school.

import { and, asc, eq, gt, or, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { getTableColumns } from 'drizzle-orm';
import { NIL_ID, encodeCursor, rewind } from './cursor';
import type { Cursor } from './cursor';
import { answerKeys } from './schema/answer-keys';
import { deletions } from './schema/deletions';
import { exams } from './schema/exams';
import { scans } from './schema/scans';
import { students } from './schema/students';
import { templates } from './schema/templates';
import type { Database } from './database';

/** How many rows of one kind come back at once. The client asks again. */
export const PAGE = 200;

export interface Changes {
  readonly templates: readonly Record<string, unknown>[];
  readonly exams: readonly Record<string, unknown>[];
  readonly answerKeys: readonly Record<string, unknown>[];
  readonly students: readonly Record<string, unknown>[];
  readonly scans: readonly Record<string, unknown>[];
  readonly deletions: readonly Record<string, unknown>[];
  /** Where to start next time. Opaque, and the client hands it straight back. */
  readonly cursor: string;
  /** True while a page was full, so the client knows to ask again immediately. */
  readonly more: boolean;
}

/** The keyset predicate: after this moment, or at it and after this id. */
function after(table: PgTable, at: Date, id: string, atColumn: string, idColumn: string) {
  const columns = getTableColumns(table);
  const moment = columns[atColumn];
  const key = columns[idColumn];
  if (moment === undefined || key === undefined) throw new Error('a synced table lost a column');
  return or(gt(moment, at), and(eq(moment, at), gt(key, id)));
}

async function since(
  db: Database,
  table: PgTable,
  from: Cursor,
): Promise<Record<string, unknown>[]> {
  const columns = getTableColumns(table);
  const moment = columns['updatedAt'];
  const key = columns['id'];
  if (moment === undefined || key === undefined) throw new Error('a synced table lost a column');

  const rows: Record<string, unknown>[] = await db
    .select()
    .from(table)
    .where(after(table, new Date(from.at), from.id, 'updatedAt', 'id'))
    .orderBy(asc(moment), asc(key))
    .limit(PAGE);
  return rows;
}

/** The largest `updated_at` in an answer, which is where the next read starts. */
function highest(pages: readonly Record<string, unknown>[][], column: string): Date | undefined {
  let top: Date | undefined;
  for (const page of pages) {
    for (const row of page) {
      const value = row[column];
      if (value instanceof Date && (top === undefined || value > top)) top = value;
    }
  }
  return top;
}

/**
 * Everything one organisation changed since the cursor it last held.
 *
 * The returned cursor is the newest row in this answer rather than the moment
 * the read happened. Using the clock would step over anything that commits
 * between the read and the reply, and there is no reason to: what the client has
 * seen is exactly what came back.
 */
export async function changesSince(db: Database, cursor: Cursor | undefined): Promise<Changes> {
  const from = rewind(cursor);

  const [template, exam, key, student, scan] = await Promise.all([
    since(db, templates, from),
    since(db, exams, from),
    since(db, answerKeys, from),
    since(db, students, from),
    since(db, scans, from),
  ]);

  const gone: Record<string, unknown>[] = await db
    .select()
    .from(deletions)
    .where(after(deletions, new Date(from.at), from.id, 'deletedAt', 'rowId'))
    .orderBy(asc(deletions.deletedAt), asc(deletions.rowId))
    .limit(PAGE);

  const pages = [template, exam, key, student, scan];
  const newest = highest(pages, 'updatedAt');
  const newestGone = highest([gone], 'deletedAt');
  const top = [newest, newestGone]
    .filter((value): value is Date => value !== undefined)
    .reduce<Date | undefined>(
      (best, value) => (best === undefined || value > best ? value : best),
      undefined,
    );

  const more = [...pages, gone].some((page) => page.length === PAGE);

  return {
    templates: template,
    exams: exam,
    answerKeys: key,
    students: student,
    scans: scan,
    deletions: gone,
    // Nothing changed means the cursor does not move, so an idle client keeps
    // asking from the same place rather than quietly skipping forward over
    // whatever was committing while it asked.
    cursor: encodeCursor(
      top === undefined ? (cursor ?? { at: 0, id: NIL_ID }) : { at: top.getTime(), id: NIL_ID },
    ),
    more,
  };
}

/** How many rows are waiting, for the indicator the plan asks the client to show. */
export async function countSince(db: Database, cursor: Cursor | undefined): Promise<number> {
  const from = rewind(cursor);
  const tables = [templates, exams, answerKeys, students, scans];
  let total = 0;
  for (const table of tables) {
    const counted: { n: number }[] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(after(table, new Date(from.at), from.id, 'updatedAt', 'id'));
    total += counted[0]?.n ?? 0;
  }
  return total;
}
