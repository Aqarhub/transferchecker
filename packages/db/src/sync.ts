// The sync surface, exactly as PLAN.md section 6 settled it.
//
// THE DEVICE IS THE SOURCE OF TRUTH AND THIS IS A COPY. Rows arrive with the
// ids the device minted (UUIDv7, which is also the idempotency key: replaying
// a batch after a dropped connection lands on the same rows), carry the
// device's own clock in `client_ts` for last-write-wins, and leave stamped
// with the SERVER's clock in `synced_at`, which is the only clock the pull
// cursor ever trusts. A device clock orders nothing here; it only breaks ties
// between two edits of the same row, which is the one job LWW has.
//
// EVERYTHING RUNS UNDER THE CALLER'S OWN TENANT HAT. Push and pull are meant
// to be wrapped in `asTenant` with the verified token's claims, so row level
// security enforces the organisation even if this code forgot to, and the
// organisation column is stamped from the CLAIMS, never read from the wire:
// the wire schemas are strict, so a payload that even mentions `orgId` is
// refused by shape before any row is touched.
//
// A row id that collides with ANOTHER organisation's row (a forged or
// miraculous uuid) cannot take that row. [measured] a replay with an equal
// device stamp dies on the last-write-wins condition before row level
// security is even consulted, and a forged NEWER stamp reaches the policy and
// is refused there. Either way the victim's row is untouched, and a test
// asserts the outcome without caring which wall the attempt hit.

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AwardSchema } from '@transferchecker/grading';
import { declaredForm, storedForm } from './form';
import { answerKeys } from './schema/answer-keys';
import { exams } from './schema/exams';
import { scans } from './schema/scans';
import { students } from './schema/students';
import { templates } from './schema/templates';
import { usage } from './schema/usage';
import type { Database } from './database';

/** The plan's own number: a hundred papers in one request, not one hundred requests. */
export const MAX_BATCH = 100;

/** How many rows one pull returns per entity before saying "come back". */
export const PULL_LIMIT = 500;

/**
 * The safety lap the pull cursor takes behind the server clock.
 *
 * A row can commit moments after a pull read past it, stamped moments before.
 * Handing the client `now` as its next cursor would skip that row forever;
 * handing it `now minus this window` re-sends the last few seconds instead,
 * and re-sending is free because every application of a pulled row is
 * idempotent (same id, same LWW rule).
 */
export const SYNC_SKEW_MS = 10_000;

const clientStamp = z.number().int().min(0).max(4_102_444_800_000);

const TemplateWire = z
  .object({
    id: z.uuid(),
    spec: z.record(z.string(), z.unknown()),
    clientTs: clientStamp,
  })
  .strict();

const ExamWire = z
  .object({
    id: z.uuid(),
    title: z.string().min(1).max(200),
    templateId: z.uuid(),
    formCount: z.number().int().min(1).max(8),
    clientTs: clientStamp,
  })
  .strict();

const KeyWire = z
  .object({
    id: z.uuid(),
    examId: z.uuid(),
    formCode: z.string().length(1),
    key: z.string().max(400),
    points: z.array(z.number().min(-100).max(100)).max(200),
    extras: z.record(z.string(), z.array(AwardSchema)),
    tags: z.record(z.string(), z.array(z.string().min(1).max(40))),
    clientTs: clientStamp,
  })
  .strict();

const StudentWire = z
  .object({
    id: z.uuid(),
    extId: z.string().min(1).max(64),
    name: z.string().max(200).nullable().optional(),
    clientTs: clientStamp,
  })
  .strict();

const ScanWire = z
  .object({
    id: z.uuid(),
    examId: z.uuid(),
    studentExtId: z.string().max(64).nullable().optional(),
    /** `formOf`'s vocabulary on the wire: absent, null, or what the box said. */
    form: z.string().max(4).nullable().optional(),
    answers: z.string().min(1).max(400),
    marks: z.string().min(1).max(400),
    score: z.number().min(-1e6).max(1e6),
    total: z.number().min(0).max(1e6),
    deviceId: z.string().min(1).max(100),
    clientTs: clientStamp,
  })
  .strict();

const UsageWire = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}-01$/, 'a month is its first day'),
    papersGraded: z.number().int().min(0).max(1_000_000),
  })
  .strict();

export const PushBatchSchema = z
  .object({
    templates: z.array(TemplateWire).max(MAX_BATCH).optional(),
    exams: z.array(ExamWire).max(MAX_BATCH).optional(),
    keys: z.array(KeyWire).max(MAX_BATCH).optional(),
    students: z.array(StudentWire).max(MAX_BATCH).optional(),
    scans: z.array(ScanWire).max(MAX_BATCH).optional(),
    usage: z.array(UsageWire).max(12).optional(),
  })
  .strict();

export type PushBatch = z.infer<typeof PushBatchSchema>;

export interface EntityCount {
  /** Rows this push actually wrote, inserted or updated. */
  readonly written: number;
  /** Rows the batch carried that changed nothing: replays and stale edits. */
  readonly skipped: number;
}

export interface PushReport {
  readonly templates: EntityCount;
  readonly exams: EntityCount;
  readonly keys: EntityCount;
  readonly students: EntityCount;
  readonly scans: EntityCount;
  readonly usage: EntityCount;
  /** The server clock this push was stamped with. A first pull cursor. */
  readonly serverTime: number;
}

const count = (given: number, written: number): EntityCount => ({
  written,
  skipped: given - written,
});

/**
 * Applies one batch from a device, idempotently, in dependency order.
 *
 * Templates before exams before keys and scans, because the device may be
 * pushing a graded stack whose exam has never reached the server: the plan's
 * offline-first promise means the whole chain can be news at once.
 *
 * Mutable rows upsert under last-write-wins on `client_ts`: a replayed batch
 * and an out-of-order stale edit both fall out as `skipped`, which is the
 * counters' whole purpose. Scans never update anything: a paper was read once,
 * and a second row with the same id is the same paper coming back after a
 * dropped connection.
 */
export async function pushSync(
  db: Database,
  orgId: string,
  batch: PushBatch,
  now: number,
): Promise<PushReport> {
  const receivedAt = new Date(now);
  const wins = (table: { clientTs: unknown }) =>
    sql`excluded.client_ts > ${table.clientTs as never}`;

  let wroteTemplates = 0;
  if (batch.templates !== undefined && batch.templates.length > 0) {
    const rows = await db
      .insert(templates)
      .values(
        batch.templates.map((row) => ({
          id: row.id,
          orgId,
          spec: row.spec,
          clientTs: new Date(row.clientTs),
          syncedAt: receivedAt,
        })),
      )
      .onConflictDoUpdate({
        target: templates.id,
        set: {
          spec: sql`excluded.spec`,
          clientTs: sql`excluded.client_ts`,
          syncedAt: receivedAt,
        },
        setWhere: wins(templates),
      })
      .returning({ id: templates.id });
    wroteTemplates = rows.length;
  }

  let wroteExams = 0;
  if (batch.exams !== undefined && batch.exams.length > 0) {
    const rows = await db
      .insert(exams)
      .values(
        batch.exams.map((row) => ({
          id: row.id,
          orgId,
          title: row.title,
          templateId: row.templateId,
          formCount: row.formCount,
          clientTs: new Date(row.clientTs),
          syncedAt: receivedAt,
        })),
      )
      .onConflictDoUpdate({
        target: exams.id,
        set: {
          title: sql`excluded.title`,
          templateId: sql`excluded.template_id`,
          formCount: sql`excluded.form_count`,
          clientTs: sql`excluded.client_ts`,
          syncedAt: receivedAt,
        },
        setWhere: wins(exams),
      })
      .returning({ id: exams.id });
    wroteExams = rows.length;
  }

  let wroteKeys = 0;
  if (batch.keys !== undefined && batch.keys.length > 0) {
    const rows = await db
      .insert(answerKeys)
      .values(
        batch.keys.map((row) => ({
          id: row.id,
          orgId,
          examId: row.examId,
          formCode: row.formCode,
          key: row.key,
          points: [...row.points],
          extras: row.extras,
          tags: row.tags,
          clientTs: new Date(row.clientTs),
          syncedAt: receivedAt,
        })),
      )
      .onConflictDoUpdate({
        target: answerKeys.id,
        set: {
          key: sql`excluded.key`,
          points: sql`excluded.points`,
          extras: sql`excluded.extras`,
          tags: sql`excluded.tags`,
          clientTs: sql`excluded.client_ts`,
          syncedAt: receivedAt,
        },
        setWhere: wins(answerKeys),
      })
      .returning({ id: answerKeys.id });
    wroteKeys = rows.length;
  }

  let wroteStudents = 0;
  if (batch.students !== undefined && batch.students.length > 0) {
    const rows = await db
      .insert(students)
      .values(
        batch.students.map((row) => ({
          id: row.id,
          orgId,
          extId: row.extId,
          name: row.name ?? null,
          clientTs: new Date(row.clientTs),
          syncedAt: receivedAt,
        })),
      )
      .onConflictDoUpdate({
        target: students.id,
        set: {
          extId: sql`excluded.ext_id`,
          name: sql`excluded.name`,
          clientTs: sql`excluded.client_ts`,
          syncedAt: receivedAt,
        },
        setWhere: wins(students),
      })
      .returning({ id: students.id });
    wroteStudents = rows.length;
  }

  let wroteScans = 0;
  if (batch.scans !== undefined && batch.scans.length > 0) {
    const rows = await db
      .insert(scans)
      .values(
        batch.scans.map((row) => ({
          id: row.id,
          orgId,
          examId: row.examId,
          studentExtId: row.studentExtId ?? null,
          form: storedForm(row.form),
          answers: row.answers,
          marks: row.marks,
          score: row.score,
          total: row.total,
          deviceId: row.deviceId,
          clientTs: new Date(row.clientTs),
          // Stamped from the injected clock rather than the column default,
          // so the pull cursor and the tests agree on whose time it is.
          createdAt: receivedAt,
        })),
      )
      .onConflictDoNothing({ target: scans.id })
      .returning({ id: scans.id });
    wroteScans = rows.length;
  }

  let wroteUsage = 0;
  if (batch.usage !== undefined && batch.usage.length > 0) {
    const rows = await db
      .insert(usage)
      .values(
        batch.usage.map((row) => ({
          orgId,
          month: row.month,
          papersGraded: row.papersGraded,
          syncedAt: receivedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [usage.orgId, usage.month],
        // The counter is monotonic and the device is its authority, so the
        // server keeps the larger of the two: a replay or a stale copy can
        // never wind the month backwards.
        set: {
          papersGraded: sql`greatest(${usage.papersGraded}, excluded.papers_graded)`,
          syncedAt: receivedAt,
        },
      })
      .returning({ month: usage.month });
    wroteUsage = rows.length;
  }

  return {
    templates: count(batch.templates?.length ?? 0, wroteTemplates),
    exams: count(batch.exams?.length ?? 0, wroteExams),
    keys: count(batch.keys?.length ?? 0, wroteKeys),
    students: count(batch.students?.length ?? 0, wroteStudents),
    scans: count(batch.scans?.length ?? 0, wroteScans),
    usage: count(batch.usage?.length ?? 0, wroteUsage),
    serverTime: now,
  };
}

export interface PullPage {
  /** The next `after`. Deliberately `now - SYNC_SKEW_MS`; see that constant. */
  readonly cursor: number;
  readonly templates: readonly Record<string, unknown>[];
  readonly exams: readonly Record<string, unknown>[];
  readonly keys: readonly Record<string, unknown>[];
  readonly students: readonly Record<string, unknown>[];
  readonly scans: readonly Record<string, unknown>[];
  readonly usage: readonly Record<string, unknown>[];
  /** Per entity: this page filled its limit, pull again from `cursor`. */
  readonly more: Readonly<Record<string, boolean>>;
}

/**
 * Everything of one organisation's that sync has touched since `after`.
 *
 * `?updatedAfter=cursor` from the plan, walked on the SERVER clock column
 * alone. Rows come back in the same wire shapes push accepts, timestamps as
 * epoch milliseconds, so a second device applies them through the exact code
 * path that wrote them locally in the first place.
 */
export async function pullSync(
  db: Database,
  orgId: string,
  after: number,
  now: number,
): Promise<PullPage> {
  const since = new Date(after);
  const ms = (value: Date): number => value.getTime();

  const pulledTemplates = await db
    .select()
    .from(templates)
    .where(sql`${templates.orgId} = ${orgId} and ${templates.syncedAt} > ${since}`)
    .orderBy(templates.syncedAt)
    .limit(PULL_LIMIT);

  const pulledExams = await db
    .select()
    .from(exams)
    .where(sql`${exams.orgId} = ${orgId} and ${exams.syncedAt} > ${since}`)
    .orderBy(exams.syncedAt)
    .limit(PULL_LIMIT);

  const pulledKeys = await db
    .select()
    .from(answerKeys)
    .where(sql`${answerKeys.orgId} = ${orgId} and ${answerKeys.syncedAt} > ${since}`)
    .orderBy(answerKeys.syncedAt)
    .limit(PULL_LIMIT);

  const pulledStudents = await db
    .select()
    .from(students)
    .where(sql`${students.orgId} = ${orgId} and ${students.syncedAt} > ${since}`)
    .orderBy(students.syncedAt)
    .limit(PULL_LIMIT);

  const pulledScans = await db
    .select()
    .from(scans)
    .where(sql`${scans.orgId} = ${orgId} and ${scans.createdAt} > ${since}`)
    .orderBy(scans.createdAt)
    .limit(PULL_LIMIT);

  const pulledUsage = await db
    .select()
    .from(usage)
    .where(sql`${usage.orgId} = ${orgId} and ${usage.syncedAt} > ${since}`)
    .orderBy(usage.syncedAt)
    .limit(PULL_LIMIT);

  return {
    cursor: now - SYNC_SKEW_MS,
    templates: pulledTemplates.map((row) => ({
      id: row.id,
      spec: row.spec,
      clientTs: ms(row.clientTs),
    })),
    exams: pulledExams.map((row) => ({
      id: row.id,
      title: row.title,
      templateId: row.templateId,
      formCount: row.formCount,
      clientTs: ms(row.clientTs),
    })),
    keys: pulledKeys.map((row) => ({
      id: row.id,
      examId: row.examId,
      formCode: row.formCode,
      key: row.key,
      points: row.points,
      extras: row.extras,
      tags: row.tags,
      clientTs: ms(row.clientTs),
    })),
    students: pulledStudents.map((row) => ({
      id: row.id,
      extId: row.extId,
      name: row.name,
      clientTs: ms(row.clientTs),
    })),
    scans: pulledScans.map((row) => {
      const form = declaredForm(row.form);
      return {
        id: row.id,
        examId: row.examId,
        studentExtId: row.studentExtId,
        ...(form === undefined ? {} : { form }),
        answers: row.answers,
        marks: row.marks,
        score: row.score,
        total: row.total,
        deviceId: row.deviceId,
        clientTs: ms(row.clientTs),
      };
    }),
    usage: pulledUsage.map((row) => ({ month: row.month, papersGraded: row.papersGraded })),
    more: {
      templates: pulledTemplates.length === PULL_LIMIT,
      exams: pulledExams.length === PULL_LIMIT,
      keys: pulledKeys.length === PULL_LIMIT,
      students: pulledStudents.length === PULL_LIMIT,
      scans: pulledScans.length === PULL_LIMIT,
      usage: pulledUsage.length === PULL_LIMIT,
    },
  };
}
