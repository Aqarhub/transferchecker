// Sync over HTTP, with a bearer token, against a real database.
//
// The chain here is the longest in the product and this is the only place all of
// it runs at once: a password becomes a token, the token becomes a claim, the
// claim becomes a database session, the policies decide what that session may
// touch, and a batch of a teacher's work lands or does not.
//
// The test that matters most is the last one. Two organisations exist, one of
// them uploads, and the other asks for everything that ever changed. It must be
// handed nothing, and the only thing standing between those two facts is the
// isolation the whole schema is built around.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SIGNUP, T0, form, post, serve } from './harness';
import type { Harness } from './harness';

let api: Harness;

const TEMPLATE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const EXAM = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const SCAN = 'cccccccc-1111-4111-8111-cccccccccccc';

const BATCH = {
  templates: [{ id: TEMPLATE, clientTs: T0, spec: { version: 4 } }],
  exams: [
    { id: EXAM, clientTs: T0, title: 'اختبار الوحدة الأولى', templateId: TEMPLATE, formCount: 1 },
  ],
  scans: [
    {
      id: SCAN,
      clientTs: T0,
      examId: EXAM,
      studentExtId: '00007',
      answers: '0123',
      marks: 'cccc',
      score: 4,
      total: 4,
      deviceId: 'Pixel 8a',
    },
  ],
};

beforeEach(async () => {
  api = await serve();
});

afterEach(async () => {
  await api.close();
});

/** A signed in, mailbox confirmed account, which is what sync requires. */
async function confirmed(email = SIGNUP.email): Promise<string> {
  await post(api.base, '/v1/auth/signup', { ...SIGNUP, email });
  const mail = api.sent.find((message) => message.to === email);
  const link = /https?:\/\/[^\s]+/.exec(mail?.text ?? '');
  if (link === null) throw new Error('no link in the message');
  const token = new URL(link[0]).searchParams.get('token') ?? '';
  await form(api.base, '/ar/confirm', { token });

  const signedIn = await post(api.base, '/v1/auth/signin', { email, password: SIGNUP.password });
  return String(signedIn.body['accessToken']);
}

const authed = (token: string, path: string, body?: unknown) =>
  fetch(`${api.base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).then(async (response) => ({
    status: response.status,
    headers: response.headers,
    // Parsed rather than asserted, which is the house rule at every boundary and
    // is also what makes a malformed answer fail here instead of three lines on.
    body: Body.parse(await response.json()),
  }));

const Body = z.record(z.string(), z.unknown());
const listOf = (body: Record<string, unknown>, name: string): unknown[] =>
  z.array(z.unknown()).parse(body[name]);

describe('who may sync at all', () => {
  it('refuses a request with no token', async () => {
    const answer = await post(api.base, '/v1/sync/push', BATCH);
    expect(answer.status).toBe(401);
    expect(answer.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('refuses a token this server did not sign', async () => {
    const answer = await authed('not.a.token', '/v1/sync/push', BATCH);
    expect(answer.status).toBe(401);
    expect(answer.body).toEqual({ error: 'invalid-token' });
  });

  // PLAN section 7 puts confirmation before cloud sync and nowhere else. This is
  // the only place in the product where the mailbox flag decides anything.
  it('refuses an unconfirmed mailbox with 403, not 401', async () => {
    await post(api.base, '/v1/auth/signup', SIGNUP);
    const signedIn = await post(api.base, '/v1/auth/signin', {
      email: SIGNUP.email,
      password: SIGNUP.password,
    });
    const answer = await authed(String(signedIn.body['accessToken']), '/v1/sync/push', BATCH);
    expect(answer.status).toBe(403);
    expect(answer.body).toEqual({ error: 'mailbox-unconfirmed' });
  });

  it('lets a confirmed one through', async () => {
    const token = await confirmed();
    const answer = await authed(token, '/v1/sync/push', BATCH);
    expect(answer.status).toBe(200);
    expect(answer.body['written']).toBe(3);
  });
});

describe('uploading', () => {
  it('stores a hundred scans once, however many times the request is retried', async () => {
    const token = await confirmed();
    await authed(token, '/v1/sync/push', BATCH);
    await authed(token, '/v1/sync/push', BATCH);
    const counted = await api.inspect<{ n: number }>('select count(*)::int as n from scans');
    expect(counted[0]?.n).toBe(1);
  });

  it('refuses a batch bigger than the limit and says what the limit is', async () => {
    const token = await confirmed();
    const many = Array.from({ length: 101 }, (_unused, index) => ({
      id: `dddddddd-1111-4111-8111-${String(index).padStart(12, '0')}`,
      clientTs: T0,
      extId: String(index),
      name: null,
    }));
    const answer = await authed(token, '/v1/sync/push', { students: many });
    expect(answer.status).toBe(400);
    expect(answer.body).toEqual({ error: 'invalid-batch', maxRowsPerKind: 100 });
  });

  it('refuses a batch that names an organisation of its own', async () => {
    const token = await confirmed();
    const answer = await authed(token, '/v1/sync/push', {
      ...BATCH,
      scans: [{ ...BATCH.scans[0], orgId: '99999999-9999-4999-8999-999999999999' }],
    });
    // The field is not in the schema, so it is stripped rather than obeyed, and
    // the row lands in the caller's own organisation.
    expect(answer.status).toBe(200);
    const stored = await api.inspect<{ org_id: string }>('select org_id from scans');
    expect(stored[0]?.org_id).not.toBe('99999999-9999-4999-8999-999999999999');
  });
});

describe('downloading', () => {
  it('hands back everything, then nothing new', async () => {
    const token = await confirmed();
    await authed(token, '/v1/sync/push', BATCH);

    const first = await authed(token, '/v1/sync/changes');
    expect(first.status).toBe(200);
    expect(listOf(first.body, 'scans')).toHaveLength(1);

    const cursor = String(first.body['cursor']);
    const second = await authed(token, `/v1/sync/changes?cursor=${encodeURIComponent(cursor)}`);
    // The overlap re-sends the tail deliberately, which an upsert absorbs. What
    // must never happen is a row the client has not seen going missing.
    expect(listOf(second.body, 'scans').length).toBeLessThanOrEqual(1);
  });

  it('carries a deletion, which an absent row could never say', async () => {
    const token = await confirmed();
    await authed(token, '/v1/sync/push', BATCH);
    await authed(token, '/v1/sync/push', { deletes: [{ entity: 'scans', id: SCAN }] });

    const changes = await authed(token, '/v1/sync/changes');
    const gone = z.array(z.object({ rowId: z.string() })).parse(changes.body['deletions']);
    expect(gone).toHaveLength(1);
    expect(gone[0]?.rowId).toBe(SCAN);
  });

  it('refuses a cursor it did not write rather than starting over', async () => {
    const token = await confirmed();
    const answer = await authed(token, '/v1/sync/changes?cursor=nonsense');
    expect(answer.status).toBe(400);
    expect(answer.body).toEqual({ error: 'invalid-cursor' });
  });

  it('counts what is waiting, for the indicator the plan asks for', async () => {
    const token = await confirmed();
    await authed(token, '/v1/sync/push', BATCH);
    const answer = await authed(token, '/v1/sync/pending');
    expect(answer.body).toEqual({ waiting: 3 });
  });
});

describe('and the wall between two schools', () => {
  // The longest chain in the product, end to end, twice over.
  it('shows one account nothing of another account work', async () => {
    const mine = await confirmed('teacher@example.sa');
    await authed(mine, '/v1/sync/push', BATCH);

    api.setNow(T0 + 3_600_000);
    const theirs = await confirmed('other@example.sa');
    const changes = await authed(theirs, '/v1/sync/changes');

    expect(changes.status).toBe(200);
    expect(changes.body['scans']).toEqual([]);
    expect(changes.body['exams']).toEqual([]);
    expect(changes.body['templates']).toEqual([]);
    expect(changes.body['deletions']).toEqual([]);
  });
});
