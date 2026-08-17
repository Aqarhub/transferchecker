// The sync interface, against a real database and through the isolation policy.
//
// Every test here runs inside `asTenant`, as an ordinary signed in client of one
// organisation, because that is the only way the properties mean anything: a
// batch that wrote with the owner's rights would prove nothing about what a
// device can do, and the last test in this file is that a device cannot write
// into a school it does not belong to however it addresses the request.

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import { changesSince, countSince } from '../src/changes';
import { decodeCursor } from '../src/cursor';
import { pushBatch } from '../src/sync';
import type { Batch } from '../src/sync';
import { asTenant } from '../src/tenant';
import { rowsOf } from '../src/audit';
import type { Database } from '../src/database';
import { ORG_A, ORG_B, USER_A, USER_B, freshDatabase, rows } from './harness';

const T0 = Date.UTC(2026, 7, 16, 12, 0, 0);
const MINUTE = 60_000;

const TEMPLATE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const EXAM = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const SCAN = 'cccccccc-1111-4111-8111-cccccccccccc';

let client: PGlite;
let db: Database;

const asA = <T>(work: (tx: Database) => Promise<T>): Promise<T> =>
  asTenant(db, { userId: USER_A, orgId: ORG_A }, work);

const push = (batch: Batch, now = T0, org = ORG_A, user = USER_A) =>
  asTenant(db, { userId: user, orgId: org }, (tx) => pushBatch(tx, batch, org, now));

/** A template and an exam, which everything else hangs off. */
const FOUNDATION: Batch = {
  templates: [{ id: TEMPLATE, clientTs: T0, spec: { version: 4 } }],
  exams: [
    { id: EXAM, clientTs: T0, title: 'اختبار الوحدة الأولى', templateId: TEMPLATE, formCount: 1 },
  ],
};

const aScan = (over: Partial<{ id: string; clientTs: number; score: number }> = {}) => ({
  id: over.id ?? SCAN,
  clientTs: over.clientTs ?? T0,
  examId: EXAM,
  studentExtId: '00007',
  answers: '0123',
  marks: 'cccc',
  score: over.score ?? 4,
  total: 4,
  deviceId: 'Pixel 8a',
});

beforeEach(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
  await client.exec(`
    insert into orgs (id, owner_id) values ('${ORG_A}', '${USER_A}'), ('${ORG_B}', '${USER_B}');
    insert into users (id, org_id, email, locale, country) values
      ('${USER_A}', '${ORG_A}', 'a@example.sa', 'ar', 'SA'),
      ('${USER_B}', '${ORG_B}', 'b@example.sa', 'ar', 'SA');
  `);
});

describe('uploading a batch', () => {
  it('writes parents before children, so one request carries both', async () => {
    const applied = await push({ ...FOUNDATION, scans: [aScan()] });
    expect(applied.written).toBe(3);
    expect(applied.stale).toEqual([]);
  });

  // The idempotency key is the row id, which the device minted offline. An
  // upload that timed out after the server committed is retried into this.
  it('sends the same batch twice and stores it once', async () => {
    await push({ ...FOUNDATION, scans: [aScan()] });
    await push({ ...FOUNDATION, scans: [aScan()] }, T0 + MINUTE);
    const counted = await rows<{ n: number }>(client, 'select count(*)::int as n from scans');
    expect(counted[0]?.n).toBe(1);
  });

  // Last writer wins, decided by the engine rather than by a read then write.
  it('lets a newer edit win and refuses an older one', async () => {
    await push({ ...FOUNDATION, scans: [aScan({ score: 4 })] });
    await push({ scans: [aScan({ clientTs: T0 + MINUTE, score: 3 })] }, T0 + MINUTE);
    const after = await rows<{ score: number }>(client, 'select score from scans');
    expect(after[0]?.score).toBe(3);

    // The week old edit of a phone that has just reconnected.
    const stale = await push(
      { scans: [aScan({ clientTs: T0 - MINUTE, score: 1 })] },
      T0 + 2 * MINUTE,
    );
    const kept = await rows<{ score: number }>(client, 'select score from scans');
    expect(kept[0]?.score).toBe(3);
    expect(stale.stale).toEqual([SCAN]);
  });

  // A device whose clock says 2099 would otherwise beat every later edit from
  // every other device for the rest of the account's life.
  it('clamps a client clock that claims the future', async () => {
    await push({
      ...FOUNDATION,
      scans: [aScan({ clientTs: Date.UTC(2099, 0, 1), score: 9 })],
    });
    const stored = await rows<{ ahead: boolean }>(
      client,
      `select client_ts > now() as ahead from scans`,
    );
    expect(stored[0]?.ahead).toBe(false);
  });

  it('writes nothing at all when one row of the batch is impossible', async () => {
    await expect(
      push({
        scans: [aScan()],
        students: [{ id: TEMPLATE, clientTs: T0, extId: '1', name: null }],
      }),
    ).rejects.toThrow();
    const counted = await rows<{ n: number }>(client, 'select count(*)::int as n from scans');
    expect(counted[0]?.n).toBe(0);
  });

  // Adding would double on every retry, and a retry is the normal case.
  it('merges the paper counter upward rather than adding it', async () => {
    await push({ usage: [{ month: '2026-08-01', papersGraded: 40 }] });
    await push({ usage: [{ month: '2026-08-01', papersGraded: 40 }] }, T0 + MINUTE);
    await push({ usage: [{ month: '2026-08-01', papersGraded: 55 }] }, T0 + 2 * MINUTE);
    await push({ usage: [{ month: '2026-08-01', papersGraded: 12 }] }, T0 + 3 * MINUTE);
    const counted = await rows<{ papers_graded: number }>(
      client,
      'select papers_graded from usage',
    );
    expect(counted[0]?.papers_graded).toBe(55);
  });
});

describe('downloading what changed', () => {
  it('returns nothing for a client that is already up to date', async () => {
    await push({ ...FOUNDATION, scans: [aScan()] });
    const first = await asA((tx) => changesSince(tx, undefined));
    expect(first.scans).toHaveLength(1);

    const cursor = decodeCursor(first.cursor);
    const second = await asA((tx) => changesSince(tx, cursor));
    // The overlap deliberately re-sends the last rows, which an upsert absorbs.
    // What must not happen is a client being handed rows it has never seen.
    expect(second.scans.length).toBeLessThanOrEqual(1);
  });

  it('returns a row written after the cursor', async () => {
    await push(FOUNDATION);
    const first = await asA((tx) => changesSince(tx, undefined));
    const cursor = decodeCursor(first.cursor);

    await client.exec(`select pg_sleep(0)`);
    await push({ scans: [aScan()] }, T0 + MINUTE);

    const second = await asA((tx) => changesSince(tx, cursor));
    expect(second.scans).toHaveLength(1);
  });

  // A deletion is a change, and it is the one a delta cannot see by itself.
  it('carries a deletion, which an absent row could never say', async () => {
    await push({ ...FOUNDATION, scans: [aScan()] });
    await push({ deletes: [{ entity: 'scans', id: SCAN }] }, T0 + MINUTE);

    const changes = await asA((tx) => changesSince(tx, undefined));
    expect(changes.deletions).toHaveLength(1);
    expect(changes.deletions[0]?.['rowId']).toBe(SCAN);
    expect(changes.deletions[0]?.['entity']).toBe('scans');
  });

  it('counts what is waiting, for the indicator the plan asks for', async () => {
    await push({ ...FOUNDATION, scans: [aScan()] });
    expect(await asA((tx) => countSince(tx, undefined))).toBe(3);
  });

  it('refuses a cursor that is not one of ours rather than trusting it', () => {
    expect(decodeCursor('not a cursor')).toBeUndefined();
    expect(decodeCursor('')).toBeUndefined();
  });
});

describe('and the isolation none of it may cross', () => {
  it('cannot read another organisation changes', async () => {
    await push({ ...FOUNDATION, scans: [aScan()] });
    const seen = await asTenant(db, { userId: USER_B, orgId: ORG_B }, (tx) =>
      changesSince(tx, undefined),
    );
    expect(seen.scans).toEqual([]);
    expect(seen.exams).toEqual([]);
    expect(seen.templates).toEqual([]);
  });

  // The organisation is never read from the request. This proves that a batch
  // claiming another one writes nothing rather than writing there.
  it('cannot write into another organisation by naming it', async () => {
    await expect(
      asTenant(db, { userId: USER_A, orgId: ORG_A }, (tx) => pushBatch(tx, FOUNDATION, ORG_B, T0)),
    ).rejects.toThrow();
    const counted = rowsOf(await db.execute(sql`select count(*)::int as n from templates`));
    expect(Number(counted[0]?.['n'])).toBe(0);
  });

  it('cannot delete a row that belongs to another organisation', async () => {
    await push({ ...FOUNDATION, scans: [aScan()] });
    const attempt = await asTenant(db, { userId: USER_B, orgId: ORG_B }, (tx) =>
      pushBatch(tx, { deletes: [{ entity: 'scans', id: SCAN }] }, ORG_B, T0 + MINUTE),
    );
    expect(attempt.deleted).toBe(0);
    const counted = await rows<{ n: number }>(client, 'select count(*)::int as n from scans');
    expect(counted[0]?.n).toBe(1);
  });
});
