// The access token, attacked rather than exercised.
//
// A token verifier is one of the few things in this repository where the happy
// path being right says almost nothing. Every well known JWT failure is a
// verifier that accepted something: the `none` algorithm, a signature checked
// after the claims were read, a key chosen by the attacker, a token from another
// service. So most of what is below presents a token that must be refused, and
// names the refusal, because a verifier that says "no" for the wrong reason is a
// verifier whose logs will mislead somebody at three in the morning.

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkAccessToken, mintAccessToken } from '../src/token';
import type { AccessClaims, TokenNames } from '../src/token';
import { generateSigningKey, readSigningKey, verifierOf } from '../src/keyring';
import type { SigningKey } from '../src/keyring';

const NOW = 1_760_000_000_000;
const MINUTE = 60_000;

const NAMES: TokenNames = {
  issuer: 'https://auth.transferchecker.app',
  audience: 'transferchecker-api',
};

const CLAIMS: AccessClaims = {
  userId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  orgId: '11111111-1111-4111-8111-111111111111',
  emailConfirmed: true,
};

function aKey(): SigningKey {
  const generated = generateSigningKey();
  const read = readSigningKey(generated.privateJwk);
  if (!read.ok) throw new Error(`could not read the key just generated: ${read.why}`);
  return read.key;
}

const KEY = aKey();
const KEYS = [verifierOf(KEY)];

interface Over {
  readonly now?: number;
  readonly lifetimeMs?: number;
}

const mint = (over: Over = {}): string =>
  mintAccessToken({
    claims: CLAIMS,
    key: KEY,
    now: over.now ?? NOW,
    names: NAMES,
    ...(over.lifetimeMs === undefined ? {} : { lifetimeMs: over.lifetimeMs }),
  });

/** Re-signs a token whose payload has been edited, which is the forgery to beat. */
const segments = (token: string): [string, string, string] => {
  const parts = token.split('.');
  const [header, payload, signature] = parts;
  if (header === undefined || payload === undefined || signature === undefined) {
    throw new Error('not a token');
  }
  return [header, payload, signature];
};

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const decode = (segment: string): Record<string, unknown> =>
  z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')));

describe('a token this server made', () => {
  it('verifies, and gives back exactly what it was told', () => {
    const check = checkAccessToken({ token: mint(), keys: KEYS, now: NOW, names: NAMES });
    expect(check).toMatchObject({ ok: true, claims: CLAIMS });
  });

  // The claim the database reads. If it moved, every isolation policy in the
  // schema would evaluate against nothing and every client would see nothing.
  it('carries the organisation in app_metadata and not in user_metadata', () => {
    const [, payload] = segments(mint());
    const body = decode(payload);
    expect(body['app_metadata']).toEqual({ org_id: CLAIMS.orgId, email_confirmed: true });
    expect(body['user_metadata']).toBeUndefined();
    expect(body['role']).toBe('authenticated');
  });

  it('names the key it was signed with, so the key can be rotated', () => {
    const [header] = segments(mint());
    expect(decode(header)).toEqual({ alg: 'EdDSA', typ: 'at+jwt', kid: KEY.kid });
  });

  it('gives two tokens minted in the same millisecond different ids', () => {
    const [, first] = segments(mint());
    const [, second] = segments(mint());
    expect(decode(first)['jti']).not.toBe(decode(second)['jti']);
  });
});

describe('the forgeries', () => {
  it('refuses a payload edited after signing', () => {
    const [header, payload, signature] = segments(mint());
    const body = decode(payload);
    body['app_metadata'] = {
      org_id: '99999999-9999-4999-8999-999999999999',
      email_confirmed: true,
    };
    const forged = `${header}.${encode(body)}.${signature}`;
    expect(checkAccessToken({ token: forged, keys: KEYS, now: NOW, names: NAMES })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  // The oldest JWT hole there is. An unsigned token must never be a token.
  it('refuses alg none, however well formed the rest of it is', () => {
    const body = decode(segments(mint())[1]);
    const forged = `${encode({ alg: 'none', typ: 'at+jwt', kid: KEY.kid })}.${encode(body)}.`;
    expect(checkAccessToken({ token: forged, keys: KEYS, now: NOW, names: NAMES })).toEqual({
      ok: false,
      reason: 'wrong-algorithm',
    });
  });

  // Algorithm confusion: sign with HMAC using the public key as the secret. It
  // works against any verifier that takes the algorithm from the header.
  it('refuses a token signed with HMAC over the public key', () => {
    const publicJwk = verifierOf(KEY).publicKey.export({ format: 'jwk' });
    const header = encode({ alg: 'HS256', typ: 'at+jwt', kid: KEY.kid });
    const payload = encode(decode(segments(mint())[1]));
    const mac = createHmac('sha256', JSON.stringify(publicJwk))
      .update(`${header}.${payload}`)
      .digest('base64url');
    expect(
      checkAccessToken({
        token: `${header}.${payload}.${mac}`,
        keys: KEYS,
        now: NOW,
        names: NAMES,
      }),
    ).toEqual({ ok: false, reason: 'wrong-algorithm' });
  });

  it('refuses a token signed by a key it does not hold', () => {
    const stranger = aKey();
    const token = mintAccessToken({ claims: CLAIMS, key: stranger, now: NOW, names: NAMES });
    expect(checkAccessToken({ token, keys: KEYS, now: NOW, names: NAMES })).toEqual({
      ok: false,
      reason: 'unknown-key',
    });
  });

  // Same key material, a key id that names ours. The signature is what decides.
  it('refuses a stranger token wearing our key id', () => {
    const stranger = aKey();
    const token = mintAccessToken({
      claims: CLAIMS,
      key: { kid: KEY.kid, privateKey: stranger.privateKey },
      now: NOW,
      names: NAMES,
    });
    expect(checkAccessToken({ token, keys: KEYS, now: NOW, names: NAMES })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('refuses a header carrying anything we did not put there', () => {
    const [, payload, signature] = segments(mint());
    const header = encode({ alg: 'EdDSA', typ: 'at+jwt', kid: KEY.kid, crit: ['exp'] });
    expect(
      checkAccessToken({
        token: `${header}.${payload}.${signature}`,
        keys: KEYS,
        now: NOW,
        names: NAMES,
      }),
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  // One session must have exactly one spelling. Buffer's base64url decoder is
  // forgiving enough that, without the canonical check, it does not.
  it('refuses a token whose signature has been padded with junk', () => {
    const token = mint();
    expect(checkAccessToken({ token: `${token}=`, keys: KEYS, now: NOW, names: NAMES })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it.each([
    ['no segments at all', ''],
    ['two segments', 'aaa.bbb'],
    ['four segments', 'aaa.bbb.ccc.ddd'],
    ['a header that is not base64url', '!!!.bbb.ccc'],
    ['a header that is not JSON', `${Buffer.from('nope').toString('base64url')}.bbb.ccc`],
  ])('refuses %s', (_name, token) => {
    expect(checkAccessToken({ token, keys: KEYS, now: NOW, names: NAMES }).ok).toBe(false);
  });
});

describe('time, at the boundary', () => {
  it('accepts a token in the last millisecond of its life', () => {
    const token = mint({ lifetimeMs: 15 * MINUTE });
    const check = checkAccessToken({
      token,
      keys: KEYS,
      now: NOW + 15 * MINUTE - 1,
      names: NAMES,
    });
    expect(check.ok).toBe(true);
  });

  it('refuses it in the first millisecond after', () => {
    const token = mint({ lifetimeMs: 15 * MINUTE });
    expect(checkAccessToken({ token, keys: KEYS, now: NOW + 15 * MINUTE, names: NAMES })).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('refuses a token issued in the future, which means a clock is wrong', () => {
    const token = mint({ now: NOW + 10 * MINUTE });
    expect(checkAccessToken({ token, keys: KEYS, now: NOW, names: NAMES })).toEqual({
      ok: false,
      reason: 'not-yet-valid',
    });
  });

  it('accepts that same token when told how far the clocks may drift', () => {
    const token = mint({ now: NOW + 2000 });
    const check = checkAccessToken({
      token,
      keys: KEYS,
      now: NOW,
      names: NAMES,
      toleranceMs: 5000,
    });
    expect(check.ok).toBe(true);
  });
});

describe('a token meant for somebody else', () => {
  it('refuses one from another issuer', () => {
    const token = mintAccessToken({
      claims: CLAIMS,
      key: KEY,
      now: NOW,
      names: { ...NAMES, issuer: 'https://auth.example.com' },
    });
    expect(checkAccessToken({ token, keys: KEYS, now: NOW, names: NAMES })).toEqual({
      ok: false,
      reason: 'wrong-issuer',
    });
  });

  it('refuses one meant for another audience', () => {
    const token = mintAccessToken({
      claims: CLAIMS,
      key: KEY,
      now: NOW,
      names: { ...NAMES, audience: 'some-other-api' },
    });
    expect(checkAccessToken({ token, keys: KEYS, now: NOW, names: NAMES })).toEqual({
      ok: false,
      reason: 'wrong-audience',
    });
  });
});

describe('rotation', () => {
  it('still verifies a token signed by the previous key', () => {
    const previous = aKey();
    const current = aKey();
    const token = mintAccessToken({ claims: CLAIMS, key: previous, now: NOW, names: NAMES });
    const ring = [verifierOf(current), verifierOf(previous)];
    expect(checkAccessToken({ token, keys: ring, now: NOW, names: NAMES }).ok).toBe(true);
  });

  it('stops verifying it once the previous key is dropped', () => {
    const previous = aKey();
    const current = aKey();
    const token = mintAccessToken({ claims: CLAIMS, key: previous, now: NOW, names: NAMES });
    expect(
      checkAccessToken({ token, keys: [verifierOf(current)], now: NOW, names: NAMES }),
    ).toEqual({ ok: false, reason: 'unknown-key' });
  });
});
