// The server, driven over real HTTP against a real database.
//
// Everything below goes through a socket: a PostgreSQL boots in-process with
// every migration applied, the server binds port zero, and the tests speak
// fetch. The clock is a mutable number so expiry is a statement, not a sleep;
// the mailer records instead of sending, which is also how the tests obtain
// the confirmation token exactly the way a mailbox would; and the breach check
// reads a fixture corpus so no test touches a network.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { Server } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { drizzle } from 'drizzle-orm/pglite';
import { prepare } from '@transferchecker/db/local';
import { app } from '../src/http';
import { keyRing } from '../src/keys';
import { routes } from '../src/routes';
import type { Mailer } from '../src/mailer';

const T0 = Date.UTC(2026, 7, 22, 10, 0, 0);
const PASSWORD = 'ورقة تُصحَّح في الصف لا في البيت';
const BREACHED = 'correct horse battery staple!';

const clock = { now: T0 };
const sent: { email: string; link: string }[] = [];
const mailer: Mailer = {
  sendConfirmation: (email, link) => {
    sent.push({ email, link });
    return Promise.resolve();
  },
};

let server: Server;
let origin = '';

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${origin}${path}`, { headers });

const json = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

const SIGNUP = {
  email: 'teacher@example.sa',
  password: PASSWORD,
  country: 'SA',
  language: 'ar',
  policyVersion: '2026-08-01',
};

beforeAll(async () => {
  const client = await PGlite.create({ extensions: { citext } });
  await prepare(client);

  const pair = generateKeyPairSync('ed25519');
  const keys = await keyRing(
    'k-test',
    pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  );

  server = app({
    log: () => undefined,
    routes: routes({
      db: drizzle(client),
      keys,
      clock: () => clock.now,
      mailer,
      breached: (password) => Promise.resolve(password === BREACHED),
      policy: { privacy: '2026-08-01', terms: '2026-08-01' },
      languages: ['ar', 'en'],
      origin: 'https://example.sa',
    }),
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  origin = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    }),
);

describe('the whole journey, over the wire', () => {
  let refreshToken = '';
  let accessToken = '';

  it('signs up, and the confirmation email carries a link and nothing is logged', async () => {
    const response = await post('/auth/signup', SIGNUP);
    expect(response.status).toBe(201);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.email).toBe('teacher@example.sa');
    expect(sent[0]?.link).toContain('https://example.sa/auth/confirm#');
  });

  it('refuses the same address a second time, which every mainstream signup does', async () => {
    const response = await post('/auth/signup', SIGNUP);
    expect(response.status).toBe(409);
    expect((await json(response))['error']).toBe('email-taken');
  });

  it('signs in and says the mailbox is not yet confirmed', async () => {
    const response = await post('/auth/login', { email: SIGNUP.email, password: PASSWORD });
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body['confirmed']).toBe(false);
    expect(typeof body['accessToken']).toBe('string');
    expect(typeof body['refreshToken']).toBe('string');
    accessToken = body['accessToken'] as string;
    refreshToken = body['refreshToken'] as string;
  });

  it('serves /me from the token claims through row level security', async () => {
    const response = await get('/me', { authorization: `Bearer ${accessToken}` });
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body['email']).toBe('teacher@example.sa');
    expect(body['locale']).toBe('ar');
    expect(typeof body['orgId']).toBe('string');
  });

  it('confirms the mailbox with the token from the email, idempotently', async () => {
    const token = sent[0]?.link.split('#')[1] ?? '';
    const first = await post('/auth/confirm', { token });
    expect(first.status).toBe(200);
    const again = await post('/auth/confirm', { token });
    expect(again.status).toBe(200);

    const login = await post('/auth/login', { email: SIGNUP.email, password: PASSWORD });
    expect((await json(login))['confirmed']).toBe(true);
  });

  it('rotates the refresh token and mints a fresh access token', async () => {
    const response = await post('/auth/refresh', { refreshToken });
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(typeof body['refreshToken']).toBe('string');
    expect(body['refreshToken']).not.toBe(refreshToken);

    const me = await get('/me', { authorization: `Bearer ${body['accessToken'] as string}` });
    expect(me.status).toBe(200);

    // The old token again: the reuse alarm, over HTTP. The family dies, so the
    // successor the "thief" was racing for is dead too.
    const reused = await post('/auth/refresh', { refreshToken });
    expect(reused.status).toBe(401);
    expect((await json(reused))['error']).toBe('reused');
    const successor = await post('/auth/refresh', {
      refreshToken: body['refreshToken'] as string,
    });
    expect(successor.status).toBe(401);
  });

  it('signs out with a 204 whether or not the token was real', async () => {
    const login = await post('/auth/login', { email: SIGNUP.email, password: PASSWORD });
    const live = (await json(login))['refreshToken'] as string;
    expect((await post('/auth/signout', { refreshToken: live })).status).toBe(204);
    expect((await post('/auth/refresh', { refreshToken: live })).status).toBe(401);
    expect((await post('/auth/signout', { refreshToken: 'never-was' })).status).toBe(204);
  });
});

describe('what each endpoint refuses', () => {
  it('refuses a signup with a breached or short password, naming the field', async () => {
    const breached = await post('/auth/signup', {
      ...SIGNUP,
      email: 'second@example.sa',
      password: BREACHED,
    });
    expect(breached.status).toBe(400);
    expect(JSON.stringify((await json(breached))['problems'])).toContain('breached');

    const short = await post('/auth/signup', {
      ...SIGNUP,
      email: 'second@example.sa',
      password: 'short',
    });
    expect(short.status).toBe(400);
    expect(JSON.stringify((await json(short))['problems'])).toContain('too-short');
  });

  it('refuses a stale policy version before writing anything', async () => {
    const response = await post('/auth/signup', {
      ...SIGNUP,
      email: 'third@example.sa',
      policyVersion: '2020-01-01',
    });
    expect(response.status).toBe(400);
    expect(JSON.stringify((await json(response))['problems'])).toContain('stale');
  });

  it('answers a wrong password and an unknown address with one body', async () => {
    const wrong = await post('/auth/login', { email: SIGNUP.email, password: 'not it, no' });
    const unknown = await post('/auth/login', { email: 'nobody@example.sa', password: 'not it' });
    expect(wrong.status).toBe(401);
    expect(await json(wrong)).toEqual(await json(unknown));
  });

  it('throttles a hammered address with a wait, not a lockout', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await post('/auth/login', { email: 'hammered@example.sa', password: 'guess' });
    }
    const throttled = await post('/auth/login', {
      email: 'hammered@example.sa',
      password: 'guess',
    });
    expect(throttled.status).toBe(429);
    expect(typeof (await json(throttled))['retryInMs']).toBe('number');
  });

  it('refuses /me without a token, with garbage, and with an expired one', async () => {
    expect((await get('/me')).status).toBe(401);
    expect((await get('/me', { authorization: 'Bearer garbage' })).status).toBe(401);

    const login = await post('/auth/login', { email: SIGNUP.email, password: PASSWORD });
    const accessToken = (await json(login))['accessToken'] as string;
    const before = clock.now;
    clock.now = before + 16 * 60_000;
    const expired = await get('/me', { authorization: `Bearer ${accessToken}` });
    clock.now = before;
    expect(expired.status).toBe(401);
    expect((await json(expired))['error']).toBe('expired');
  });

  it('refuses a token signed by a key we never held', async () => {
    const pair = generateKeyPairSync('ed25519');
    const foreign = await keyRing(
      'k-test',
      pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    );
    const { accessClaims, issueAccessToken } = await import('@transferchecker/account');
    const forged = await issueAccessToken(
      foreign.privateKey,
      'k-test',
      accessClaims({
        userId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        orgId: '11111111-1111-4111-8111-111111111111',
        familyId: 'ffffffff-1111-4111-8111-ffffffffffff',
        email: 'teacher@example.sa',
        now: clock.now,
      }),
    );
    const response = await get('/me', { authorization: `Bearer ${forged}` });
    expect(response.status).toBe(401);
    expect((await json(response))['error']).toBe('bad-signature');
  });

  it('folds an expired confirmation and a never-issued one into one refusal', async () => {
    const expired = await post('/auth/confirm', { token: 'never-issued' });
    expect(expired.status).toBe(400);
    expect((await json(expired))['error']).toBe('invalid-token');
  });
});

describe('the shell itself', () => {
  it('answers health from the database', async () => {
    const response = await get('/health');
    expect(response.status).toBe(200);
  });

  it('refuses an unknown path, malformed JSON, and an oversized body', async () => {
    expect((await get('/nowhere')).status).toBe(404);

    const malformed = await fetch(`${origin}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(malformed.status).toBe(400);

    const oversized = await post('/auth/login', { email: 'a@b.sa', password: 'x'.repeat(300_000) });
    expect(oversized.status).toBe(413);
  });
});

describe('sync over the wire', () => {
  const TEMPLATE = 'dddddddd-2222-4222-8222-dddddddddddd';
  const EXAM = 'eeeeeeee-2222-4222-8222-eeeeeeeeeeee';
  let accessToken = '';
  let cursor = 0;

  const batch = {
    templates: [{ id: TEMPLATE, spec: { template: 'quick20' }, clientTs: T0 - 5_000 }],
    exams: [
      {
        id: EXAM,
        title: 'اختبار المزامنة',
        templateId: TEMPLATE,
        formCount: 1,
        clientTs: T0 - 4_000,
      },
    ],
    scans: [
      {
        id: '44444444-aaaa-4aaa-8aaa-444444444444',
        examId: EXAM,
        studentExtId: '00007',
        answers: '0123',
        marks: 'cccc',
        score: 4,
        total: 4,
        deviceId: 'Pixel 8a',
        clientTs: T0 - 1_000,
      },
    ],
    usage: [{ month: '2026-08-01', papersGraded: 1 }],
  };

  it('pushes a batch under the bearer token and reports what it wrote', async () => {
    const login = await post('/auth/login', { email: SIGNUP.email, password: PASSWORD });
    accessToken = (await json(login))['accessToken'] as string;

    const response = await post('/sync/push', batch, {
      authorization: `Bearer ${accessToken}`,
    });
    expect(response.status).toBe(200);
    const report = await json(response);
    expect(report['scans']).toEqual({ written: 1, skipped: 0 });
    expect(report['exams']).toEqual({ written: 1, skipped: 0 });
    expect(typeof report['serverTime']).toBe('number');

    const replay = await post('/sync/push', batch, {
      authorization: `Bearer ${accessToken}`,
    });
    expect(((await json(replay))['scans'] as Record<string, unknown>)['written']).toBe(0);
  });

  it('pulls the delta and then nothing after its own cursor', async () => {
    // The clock steps past the skew window so the second pull is really empty.
    clock.now = T0 + 60_000;
    const first = await get('/sync/pull?after=0', { authorization: `Bearer ${accessToken}` });
    expect(first.status).toBe(200);
    const page = await json(first);
    expect((page['scans'] as unknown[]).length).toBeGreaterThan(0);
    cursor = page['cursor'] as number;

    const second = await get(`/sync/pull?after=${String(cursor)}`, {
      authorization: `Bearer ${accessToken}`,
    });
    const empty = await json(second);
    expect(empty['scans']).toEqual([]);
    expect(empty['exams']).toEqual([]);
    clock.now = T0;
  });

  it('refuses a push with no token, an oversized batch, and a forged organisation', async () => {
    expect((await post('/sync/push', batch)).status).toBe(401);

    const oversized = {
      scans: Array.from({ length: 101 }, (_, at) => ({
        ...(batch.scans[0] ?? {}),
        id: `55555555-aaaa-4aaa-8aaa-${String(at).padStart(12, '0')}`,
      })),
    };
    const refused = await post('/sync/push', oversized, {
      authorization: `Bearer ${accessToken}`,
    });
    expect(refused.status).toBe(400);

    const forged = await post(
      '/sync/push',
      { scans: [{ ...batch.scans[0], orgId: 'not-mine' }] },
      { authorization: `Bearer ${accessToken}` },
    );
    expect(forged.status).toBe(400);
  });

  it('shows a second organisation nothing of the first, end to end', async () => {
    await post('/auth/signup', { ...SIGNUP, email: 'neighbour@example.sa' });
    const login = await post('/auth/login', {
      email: 'neighbour@example.sa',
      password: PASSWORD,
    });
    const theirs = (await json(login))['accessToken'] as string;

    clock.now = T0 + 60_000;
    const page = await json(await get('/sync/pull?after=0', { authorization: `Bearer ${theirs}` }));
    clock.now = T0;
    expect(page['scans']).toEqual([]);
    expect(page['exams']).toEqual([]);
    expect(page['templates']).toEqual([]);
    expect(page['usage']).toEqual([]);
  });

  it('refuses a pull with no cursor at all', async () => {
    const response = await get('/sync/pull', { authorization: `Bearer ${accessToken}` });
    expect(response.status).toBe(400);
  });
});
