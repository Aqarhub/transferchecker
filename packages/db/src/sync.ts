// The upload half of the sync interface: a batch in, one transaction, no doubles.
//
// PLAN section 6 asks for four properties and every one of them is here rather
// than in the client, because a property the client keeps is a property one
// broken client loses.
//
// ONE TRANSACTION FOR THE WHOLE BATCH, which is acceptance criterion 18: a
// hundred scans survive a SIGKILL with no row missing and none doubled. Either
// all of it landed or none of it did, and the retry is the same request.
//
// THE IDEMPOTENCY KEY IS THE ROW ID, which the plan names. The device mints a
// UUIDv7 before it has ever had a network, so an upload that timed out after the
// server committed is retried into an upsert on the same primary key and changes
// nothing. There is no separate key to store, expire or forget.
//
// LAST WRITER WINS IS ENFORCED BY THE DATABASE, not decided in application code.
// The update carries `where existing.client_ts <= incoming.client_ts`, so an
// edit made a week ago on a phone that has just reconnected cannot overwrite one
// made today on a tablet. Deciding it here rather than in a read then write
// would also be a race between two devices syncing at once.
//
// AND THE ORDER OF THE STATEMENTS IS THE FOREIGN KEYS. Rows are written parents
// first and deleted children first, so a batch holding an exam and its key, or
// dropping an exam and its scans, does not have to be split by the client.

import { getTableColumns, inArray, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { clampClientTime } from './cursor';
import { answerKeys } from './schema/answer-keys';
import { DELETABLE } from './schema/deletions';
import { exams } from './schema/exams';
import { scans } from './schema/scans';
import { students } from './schema/students';
import { templates } from './schema/templates';
import { usage } from './schema/usage';
import type { Database } from './database';

/** A hundred, which is the plan's own batch size. */
export const MAX_BATCH = 100;

const Uuid = z.uuid();
const Moment = z.number().int().nonnegative();

const Common = { id: Uuid, clientTs: Moment };

/**
 * What a device may send, per table.
 *
 * `org_id` is deliberately absent from every one of these. It is not taken from
 * the request at all: it comes from the verified token, through the session the
 * write runs in, and the isolation policy checks it again on the way in. A batch
 * that could name its own organisation would be a batch that could write into
 * somebody else's school.
 */
export const BatchSchema = z.object({
  templates: z
    .array(z.object({ ...Common, spec: z.unknown() }))
    .max(MAX_BATCH)
    .optional(),
  exams: z
    .array(
      z.object({
        ...Common,
        title: z.string().max(200),
        templateId: Uuid,
        formCount: z.number().int().min(1).max(26),
      }),
    )
    .max(MAX_BATCH)
    .optional(),
  answerKeys: z
    .array(
      z.object({
        ...Common,
        examId: Uuid,
        formCode: z.string().length(1),
        key: z.string().max(4096),
        points: z.array(z.number()).max(500),
        extras: z.unknown(),
        tags: z.unknown(),
      }),
    )
    .max(MAX_BATCH)
    .optional(),
  students: z
    .array(z.object({ ...Common, extId: z.string().max(64), name: z.string().max(200).nullable() }))
    .max(MAX_BATCH)
    .optional(),
  scans: z
    .array(
      z.object({
        ...Common,
        examId: Uuid,
        studentExtId: z.string().max(64).nullable(),
        answers: z.string().max(4096),
        marks: z.string().max(4096),
        score: z.number(),
        total: z.number(),
        deviceId: z.string().max(64),
      }),
    )
    .max(MAX_BATCH)
    .optional(),
  /** The paper counter, merged upward and never added. See `mergeUsage`. */
  usage: z
    .array(z.object({ month: z.string().max(10), papersGraded: z.number().int().min(0) }))
    .max(24)
    .optional(),
  deletes: z
    .array(z.object({ entity: z.enum(DELETABLE), id: Uuid }))
    .max(MAX_BATCH)
    .optional(),
});

export type Batch = z.infer<typeof BatchSchema>;

export interface Applied {
  /** How many rows of each kind were written or already matched. */
  readonly written: number;
  /** Ids the database refused because it holds a newer version. */
  readonly stale: readonly string[];
  readonly deleted: number;
}

/**
 * The columns an upsert overwrites: everything but the key and the organisation.
 *
 * Built from the table rather than listed, so a column added to the schema is
 * carried by the sync without anybody remembering to add it here. Forgetting
 * would not fail: it would sync a row with one field silently frozen.
 */
function overwrites(table: PgTable): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const [name, column] of Object.entries(getTableColumns(table))) {
    if (name === 'id' || name === 'orgId' || name === 'createdAt' || name === 'updatedAt') continue;
    set[name] = sql.raw(`excluded.${column.name}`);
  }
  // The server's clock, always. A cursor that read a device's clock would skip
  // every row written by a device whose clock is behind. See `columns.ts`.
  set['updatedAt'] = sql`now()`;
  return set;
}

/** The last writer wins rule, as a condition the engine evaluates. */
const newerWins = (table: PgTable): ReturnType<typeof sql> =>
  sql`${table}.client_ts <= excluded.client_ts`;

interface Written {
  readonly id: string;
}

async function upsert(
  db: Database,
  table: PgTable,
  rows: readonly Record<string, unknown>[],
): Promise<readonly string[]> {
  if (rows.length === 0) return [];
  const key = getTableColumns(table)['id'];
  if (key === undefined) throw new Error('a synced table must be keyed by id');
  const done: Written[] = await db
    .insert(table)
    .values([...rows])
    .onConflictDoUpdate({ target: key, set: overwrites(table), setWhere: newerWins(table) })
    .returning({ id: sql<string>`id` });
  return done.map((row) => row.id);
}

/** The shape every synced row shares, whatever else it carries. */
interface Sent {
  readonly id: string;
  readonly clientTs: number;
}

/** Every row of one kind, with the organisation and the clock filled in here. */
const prepare = (
  rows: readonly Sent[] | undefined,
  orgId: string,
  now: number,
): Record<string, unknown>[] =>
  (rows ?? []).map((row) => {
    const { clientTs, ...rest } = row;
    return { ...rest, orgId, clientTs: new Date(clampClientTime(clientTs, now)) };
  });

/**
 * Writes one batch, or none of it.
 *
 * MUST BE CALLED INSIDE `asTenant`. Nothing here names an organisation in a
 * `where`: the isolation policy does that, from the verified token, and a caller
 * that forgets the session wrapper writes nothing at all rather than writing
 * into the wrong school.
 */
export async function pushBatch(
  db: Database,
  batch: Batch,
  orgId: string,
  now: number,
): Promise<Applied> {
  return db.transaction(async (tx) => {
    const stale: string[] = [];
    let written = 0;

    // Parents first. An exam needs its template, a key and a scan need the exam.
    const order: readonly (readonly [PgTable, readonly Sent[] | undefined])[] = [
      [templates, batch.templates],
      [exams, batch.exams],
      [answerKeys, batch.answerKeys],
      [students, batch.students],
      [scans, batch.scans],
    ];

    for (const [table, rows] of order) {
      const values = prepare(rows, orgId, now);
      const applied = await upsert(tx, table, values);
      written += applied.length;
      const kept = new Set(applied);
      for (const row of values) {
        const id = row['id'];
        if (typeof id === 'string' && !kept.has(id)) stale.push(id);
      }
    }

    written += await mergeUsage(tx, batch.usage, orgId, now);
    const deleted = await applyDeletes(tx, batch.deletes);
    return { written, stale, deleted };
  });
}

/**
 * The paper counter, merged upward rather than added.
 *
 * ADDING WOULD DOUBLE ON EVERY RETRY, and a retry is the normal case here: the
 * upload that timed out after the server committed is sent again. The device
 * holds a running total for the month, so the merge that is both correct and
 * idempotent is the larger of the two. It also means a device that has been
 * offline cannot lower a count another device already reported.
 */
async function mergeUsage(
  db: Database,
  rows: Batch['usage'],
  orgId: string,
  now: number,
): Promise<number> {
  if (rows === undefined || rows.length === 0) return 0;
  await db
    .insert(usage)
    .values(
      rows.map((row) => ({
        orgId,
        month: row.month,
        papersGraded: row.papersGraded,
        syncedAt: new Date(now),
      })),
    )
    .onConflictDoUpdate({
      target: [usage.orgId, usage.month],
      set: {
        papersGraded: sql`greatest(${usage.papersGraded}, excluded.papers_graded)`,
        syncedAt: new Date(now),
      },
    });
  return rows.length;
}

/**
 * Children first, so a batch dropping an exam and its scans does not need the
 * client to order it. The tombstone is written by a trigger, not from here.
 */
async function applyDeletes(db: Database, rows: Batch['deletes']): Promise<number> {
  if (rows === undefined || rows.length === 0) return 0;
  const tables = [
    ['scans', scans],
    ['answer_keys', answerKeys],
    ['students', students],
    ['exams', exams],
    ['templates', templates],
  ] as const;

  let deleted = 0;
  for (const [name, table] of tables) {
    const ids = rows.filter((row) => row.entity === name).map((row) => row.id);
    if (ids.length === 0) continue;
    const gone = await db
      .delete(table)
      .where(inArray(sql.raw('id'), ids))
      .returning({ id: sql<string>`id` });
    deleted += gone.length;
  }
  return deleted;
}
