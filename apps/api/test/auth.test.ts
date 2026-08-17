// The authentication endpoints, over HTTP, against a real database.
//
// The chain these prove is the one nothing else could: a request arrives, the
// server becomes a role that owns nothing, the database admits exactly what its
// policies allow, a token is minted, and the reply says the same thing to an
// attacker as it does to a teacher.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkAccessToken } from '@transferchecker/account';
import { SIGNUP, T0, TOKENS, get, post, serve } from './harness';
import type { Harness } from './harness';

let api: Harness;

beforeEach(async () => {
  api = await serve();
});

afterEach(async () => {
  await api.close();
});

const signedIn = async (): Promise<Record<string, unknown>> => {
  await post(api.base, '/v1/auth/signup', SIGNUP);
  const answer = await post(api.base, '/v1/auth/signin', {
    email: SIGNUP.email,
    password: SIGNUP.password,
    deviceLabel: 'Pixel 8a',
  });
  return answer.body;
};

describe('signing up', () => {
  it('accepts a new account and sends one confirmation', async () => {
    const answer = await post(api.base, '/v1/auth/signup', SIGNUP);
    expect(answer.status).toBe(202);
    expect(answer.body).toEqual({ status: 'confirm-your-mailbox' });
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]?.to).toBe(SIGNUP.email);
  });

  // The leak this route is written around. An address that is taken and one
  // that is free must be indistinguishable from outside.
  it('answers a taken address exactly as it answers a free one', async () => {
    const first = await post(api.base, '/v1/auth/signup', SIGNUP);
    const second = await post(api.base, '/v1/auth/signup', {
      ...SIGNUP,
      password: 'a completely different passphrase',
    });
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);

    // And nothing was created the second time, including no second mail.
    expect(api.sent).toHaveLength(1);
    const accounts = await api.inspect<{ n: number }>('select count(*)::int as n from users');
    expect(accounts[0]?.n).toBe(1);
  });

  it('refuses a password shorter than the rules allow, per field', async () => {
    const answer = await post(api.base, '/v1/auth/signup', { ...SIGNUP, password: 'short' });
    expect(answer.status).toBe(400);
    expect(answer.body['error']).toBe('invalid-signup');
  });

  it('refuses a consent to a policy version that is not live', async () => {
    const answer = await post(api.base, '/v1/auth/signup', {
      ...SIGNUP,
      policyVersion: '2020-01-01',
    });
    expect(answer.status).toBe(400);
  });

  it('refuses a country the product does not offer', async () => {
    const answer = await post(api.base, '/v1/auth/signup', { ...SIGNUP, country: 'ZZ' });
    expect(answer.status).toBe(400);
  });
});

describe('signing in', () => {
  it('mints a pair, and the access token verifies against the public key', async () => {
    const body = await signedIn();
    expect(typeof body['accessToken']).toBe('string');
    expect(body['emailConfirmed']).toBe(false);

    const check = checkAccessToken({
      token: String(body['accessToken']),
      keys: TOKENS.keyring.verifying,
      now: T0,
      names: TOKENS.names,
    });
    expect(check.ok).toBe(true);
  });

  // One answer for both, because the pair of them is the directory this whole
  // path exists to withhold.
  it('answers a wrong password and an unknown address identically', async () => {
    await post(api.base, '/v1/auth/signup', SIGNUP);
    const wrong = await post(api.base, '/v1/auth/signin', {
      email: SIGNUP.email,
      password: 'not the password',
    });
    const nobody = await post(api.base, '/v1/auth/signin', {
      email: 'nobody@example.sa',
      password: SIGNUP.password,
    });
    expect(wrong.status).toBe(401);
    expect(nobody.status).toBe(401);
    expect(wrong.body).toEqual(nobody.body);
    expect(wrong.body).toEqual({ error: 'invalid-credentials' });
  });

  // PLAN section 7: ten attempts a minute per address. The account throttle is a
  // different defence and is proved in packages/db.
  it('refuses the eleventh attempt in a minute from one address', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await post(api.base, '/v1/auth/signin', { email: `a${String(attempt)}@x.sa`, password: 'x' });
    }
    const answer = await post(api.base, '/v1/auth/signin', { email: 'a11@x.sa', password: 'x' });
    expect(answer.status).toBe(429);
    expect(answer.body['error']).toBe('too-many-requests');
    expect(answer.headers.get('retry-after')).toBeTruthy();
  });

  it('lets the same address through once the window has passed', async () => {
    for (let attempt = 0; attempt < 11; attempt += 1) {
      await post(api.base, '/v1/auth/signin', { email: `b${String(attempt)}@x.sa`, password: 'x' });
    }
    api.setNow(T0 + 61_000);
    const answer = await post(api.base, '/v1/auth/signin', { email: 'b12@x.sa', password: 'x' });
    expect(answer.status).toBe(401);
  });
});

describe('refreshing', () => {
  it('rotates the token and mints a new access token', async () => {
    const first = await signedIn();
    api.setNow(T0 + 60_000);
    const answer = await post(api.base, '/v1/auth/refresh', {
      refreshToken: first['refreshToken'],
    });
    expect(answer.status).toBe(200);
    expect(answer.body['refreshToken']).not.toBe(first['refreshToken']);
  });

  // The alarm. The thief is told nothing, and the family is already dead.
  it('refuses a replayed token, says nothing extra, and kills the family', async () => {
    const first = await signedIn();
    api.setNow(T0 + 60_000);
    const rotated = await post(api.base, '/v1/auth/refresh', {
      refreshToken: first['refreshToken'],
    });
    const replayed = await post(api.base, '/v1/auth/refresh', {
      refreshToken: first['refreshToken'],
    });
    expect(replayed.status).toBe(401);
    expect(replayed.body).toEqual({ error: 'invalid-token' });

    // The successor the real user was holding is dead too.
    const after = await post(api.base, '/v1/auth/refresh', {
      refreshToken: rotated.body['refreshToken'],
    });
    expect(after.status).toBe(401);
    expect(api.lines).toContain('refresh: refused, reused');
  });

  it('refuses a token nobody issued with the same body', async () => {
    const answer = await post(api.base, '/v1/auth/refresh', { refreshToken: 'invented' });
    expect(answer.body).toEqual({ error: 'invalid-token' });
  });
});

describe('signing out', () => {
  it('ends the session, and answers the same for a token nobody issued', async () => {
    const grant = await signedIn();
    const out = await post(api.base, '/v1/auth/signout', { refreshToken: grant['refreshToken'] });
    expect(out.status).toBe(204);

    const after = await post(api.base, '/v1/auth/refresh', {
      refreshToken: grant['refreshToken'],
    });
    expect(after.status).toBe(401);

    const stranger = await post(api.base, '/v1/auth/signout', { refreshToken: 'invented' });
    expect(stranger.status).toBe(204);
  });
});

describe('what every answer carries', () => {
  it('sets the headers that keep a secret out of a referer and a cache', async () => {
    const answer = await get(api.base, '/healthz');
    expect(answer.headers.get('referrer-policy')).toBe('no-referrer');
    expect(answer.headers.get('cache-control')).toBe('no-store');
    expect(answer.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('says whether a mail service is configured', async () => {
    const answer = await get(api.base, '/healthz');
    expect(answer.body).toEqual({ ok: true, mail: 'ready' });
  });

  it('refuses a body larger than the limit rather than reading it', async () => {
    const answer = await post(api.base, '/v1/auth/signin', {
      email: 'a@b.sa',
      password: 'x'.repeat(32 * 1024),
    });
    expect(answer.status).toBe(413);
    expect(answer.body).toEqual({ error: 'too-large' });
  });

  it('answers an unknown route without saying anything about itself', async () => {
    const answer = await get(api.base, '/v1/auth/whatever');
    expect(answer.status).toBe(404);
    expect(answer.body).toEqual({ error: 'no-such-route' });
  });

  // The log is the one place a reason belongs, and it is also the easiest place
  // in the product to leak an address into.
  it('writes no address and no token into the log', async () => {
    await signedIn();
    await post(api.base, '/v1/auth/signin', { email: SIGNUP.email, password: 'wrong' });
    const written = api.lines.join('\n');
    expect(written).not.toContain(SIGNUP.email);
    expect(written).not.toContain(SIGNUP.password);
  });
});
