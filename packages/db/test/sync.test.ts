// The sync surface, proven under the tenant hat it will actually wear.
//
// Every push and pull below runs inside `asTenant`, exactly as the server
// wraps them, so row level security is a participant in every assertion
// rather than something a separate test vouches for. The properties are the
// plan's own list: idempotent replay, last write wins, a monotonic counter,
// a cursor that never trusts a device clock, and an organisation that comes
// from the claims and nowhere else.

import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { PushBatchSchema, pullSync, pushSync } from '../src/sync';
import type { PushBatch } from '../src/sync';
import { SYNC_SKEW_MS } from '../src/sync';
import { asTenant } from '../src/tenant';
import type { Database } from '../src/database';
import { ORG_A, ORG_B, USER_A, USER_B, freshDatabase, rows } from './harness';

const T0 = Date.UTC(2026, 7, 22, 12, 0, 0);
const TEMPLATE = 'dddddddd-1111-4111-8111-dddddddddddd';
const EXAM = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
const KEY = 'abababab-1111-4111-8111-abababababab';
const SCAN_ONE = '11111111-aaaa-4aaa-8aaa-111111111111';
const SCAN_TWO = '22222222-aaaa-4aaa-8aaa-222222222222';

let client: PGlite;
let db: Database;

const TEMPLATE_ROW = { id: TEMPLATE, spec: { template: 'quick20' }, clientTs: T0 - 5_000 };
const EXAM_ROW = {
  id: EXAM,
  title: 'اختبار الأسبوع',
  templateId: TEMPLATE,
  formCount: 1,
  clientTs: T0 - 4_000,
};
const SCAN_ROW = {
  id: SCAN_ONE,
  examId: EXAM,
  studentExtId: '00007',
  answers: '0123',
  marks: 'cccc',
  score: 4,
  total: 4,
  deviceId: 'Pixel 8a',
  clientTs: T0 - 1_000,
};

const BATCH: PushBatch = {
  templates: [TEMPLATE_ROW],
  exams: [EXAM_ROW],
  keys: [
    {
      id: KEY,
      examId: EXAM,
      formCode: 'A',
      key: '0123',
      points: [1, 1, 1, 1],
      extras: {},
      tags: {},
      clientTs: T0 - 3_000,
    },
  ],
  students: [
    {
      id: '33333333-aaaa-4aaa-8aaa-333333333333',
      extId: '00007',
      name: null,
      clientTs: T0 - 2_000,
    },
  ],
  scans: [SCAN_ROW],
  usage: [{ month: '2026-08-01', papersGraded: 1 }],
};

const asA = <T>(work: (tx: Database) => Promise<T>): Promise<T> =>
  asTenant(db, { userId: USER_A, orgId: ORG_A }, work);

beforeEach(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
  await client.exec(`
    insert into orgs (id, owner_id) values ('${ORG_A}', '${USER_A}'), ('${ORG_B}', '${USER_B}');
    insert into users (id, org_id, email, locale, country)
      values ('${USER_A}', '${ORG_A}', 'a@example.sa', 'ar', 'SA'),
             ('${USER_B}', '${ORG_B}', 'b@example.sa', 'ar', 'SA');
  `);
});

describe('pushing a batch', () => {
  it('lands the whole dependency chain in one request, stamped with the claims org', async () => {
    const report = await asA((tx) => pushSync(tx, ORG_A, BATCH, T0));
    expect(report.scans).toEqual({ written: 1, skipped: 0 });
    expect(report.exams.written).toBe(1);

    const landed = await rows<{ org_id: string }>(
      client,
      `select org_id from scans where id = '${SCAN_ONE}'`,
    );
    expect(landed[0]?.org_id).toBe(ORG_A);
  });

  it('treats a replayed batch as news about nothing', async () => {
    await asA((tx) => pushSync(tx, ORG_A, BATCH, T0));
    const replay = await asA((tx) => pushSync(tx, ORG_A, BATCH, T0 + 60_000));
    expect(replay.scans).toEqual({ written: 0, skipped: 1 });
    expect(replay.exams).toEqual({ written: 0, skipped: 1 });
    expect(replay.templates.skipped).toBe(1);

    const counted = await rows<{ n: number }>(client, 'select count(*)::int as n from scans');
    expect(counted[0]?.n).toBe(1);
  });

  it('lets the newer edit win and refuses the stale one, by the device clock', async () => {
    await asA((tx) => pushSync(tx, ORG_A, BATCH, T0));
    const renamed = {
      exams: [{ ...EXAM_ROW, title: 'اسم أدق', clientTs: T0 + 10_000 }],
    };
    const newer = await asA((tx) => pushSync(tx, ORG_A, renamed, T0 + 60_000));
    expect(newer.exams).toEqual({ written: 1, skipped: 0 });

    // The stale original replays after the rename, as a retried batch would.
    const stale = await asA((tx) => pushSync(tx, ORG_A, { exams: BATCH.exams }, T0 + 120_000));
    expect(stale.exams).toEqual({ written: 0, skipped: 1 });
    const kept = await rows<{ title: string }>(client, `select title from exams`);
    expect(kept[0]?.title).toBe('اسم أدق');
  });

  it('never winds the paper counter backwards', async () => {
    await asA((tx) =>
      pushSync(tx, ORG_A, { usage: [{ month: '2026-08-01', papersGraded: 12 }] }, T0),
    );
    await asA((tx) =>
      pushSync(tx, ORG_A, { usage: [{ month: '2026-08-01', papersGraded: 8 }] }, T0 + 1),
    );
    const kept = await rows<{ papers_graded: number }>(client, 'select papers_graded from usage');
    expect(kept[0]?.papers_graded).toBe(12);
  });

  it('refuses a payload that so much as mentions an organisation', () => {
    const forged = PushBatchSchema.safeParse({
      scans: [{ ...SCAN_ROW, orgId: ORG_B }],
    });
    expect(forged.success).toBe(false);
  });

  it('cannot steal a row whose id collides with another organisation', async () => {
    await asTenant(db, { userId: USER_B, orgId: ORG_B }, (tx) =>
      pushSync(tx, ORG_B, { templates: BATCH.templates }, T0),
    );
    // Same template id pushed by A, with a NEWER device stamp, which is the
    // strongest claim a forged push can make. [measured] an equal stamp dies
    // on the LWW condition before row level security is even consulted; this
    // asserts the newer stamp cannot take the row either, however it dies.
    const forged = {
      templates: [{ ...TEMPLATE_ROW, clientTs: T0 + 999_000 }],
    };
    const attempt = asA((tx) => pushSync(tx, ORG_A, forged, T0 + 1_000));
    const outcome = await attempt.then(
      (report) => report.templates.written,
      () => 0,
    );
    expect(outcome).toBe(0);
    const kept = await rows<{ org_id: string; client_ts: Date }>(
      client,
      'select org_id, client_ts from templates',
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.org_id).toBe(ORG_B);
    expect(kept[0]?.client_ts.getTime()).toBe(T0 - 5_000);
  });
});

describe('pulling the delta', () => {
  it('returns everything after the epoch, and nothing after its own cursor', async () => {
    await asA((tx) => pushSync(tx, ORG_A, BATCH, T0));
    const first = await asA((tx) => pullSync(tx, ORG_A, 0, T0 + SYNC_SKEW_MS + 1_000));
    expect(first.scans).toHaveLength(1);
    expect(first.exams).toHaveLength(1);
    expect(first.usage).toEqual([{ month: '2026-08-01', papersGraded: 1 }]);
    expect(first.cursor).toBe(T0 + 1_000);

    const second = await asA((tx) => pullSync(tx, ORG_A, first.cursor, T0 + 90_000));
    expect(second.scans).toHaveLength(0);
    expect(second.exams).toHaveLength(0);
  });

  it('re-sends the skew window rather than ever skipping a late commit', async () => {
    await asA((tx) => pushSync(tx, ORG_A, BATCH, T0));
    // A pull taken the same instant as the push: the cursor steps back behind
    // it, so the next pull sees the row again instead of never.
    const page = await asA((tx) => pullSync(tx, ORG_A, 0, T0));
    expect(page.cursor).toBe(T0 - SYNC_SKEW_MS);
    const again = await asA((tx) => pullSync(tx, ORG_A, page.cursor, T0 + 1));
    expect(again.scans).toHaveLength(1);
  });

  it('carries a second scan through push and pull in the wire shape it arrived in', async () => {
    await asA((tx) => pushSync(tx, ORG_A, BATCH, T0));
    const later = {
      scans: [
        {
          ...SCAN_ROW,
          id: SCAN_TWO,
          form: null,
          answers: '01?3',
          marks: 'ccbc',
          clientTs: T0 + 5_000,
        },
      ],
    };
    await asA((tx) => pushSync(tx, ORG_A, later, T0 + 60_000));
    const page = await asA((tx) => pullSync(tx, ORG_A, T0 + 30_000, T0 + 120_000));
    expect(page.scans).toHaveLength(1);
    expect(page.scans[0]).toMatchObject({
      id: SCAN_TWO,
      answers: '01?3',
      form: null,
      clientTs: T0 + 5_000,
    });
  });

  it('shows one organisation nothing of the other, through the same functions', async () => {
    await asA((tx) => pushSync(tx, ORG_A, BATCH, T0));
    const page = await asTenant(db, { userId: USER_B, orgId: ORG_B }, (tx) =>
      pullSync(tx, ORG_B, 0, T0 + 60_000),
    );
    expect(page.scans).toHaveLength(0);
    expect(page.exams).toHaveLength(0);
    expect(page.templates).toHaveLength(0);
    expect(page.usage).toHaveLength(0);
  });
});
