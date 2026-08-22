// The access token, attacked before it is trusted.
//
// The round trip is one test. Everything after it is a forgery attempt: the
// wrong type, the wrong algorithm, no algorithm at all, an unknown key, a
// tampered payload, a signature from somebody else's key, and a valid
// signature over claims that describe nobody. Each must come back as its own
// refusal, as data, because the server's next line after `ok` is handing the
// claims to the database as `request.jwt.claims`.

import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, generateKeyPair } from 'jose';
import type { JWTPayload } from 'jose';
import {
  ACCESS_LIFETIME_MS,
  CLOCK_TOLERANCE_MS,
  CONFIRMATION_LIFETIME_MS,
  ISSUER,
  accessClaims,
  confirmationFresh,
  issueAccessToken,
  verifyAccessToken,
} from '../src/index';
import type { SigningKey } from '../src/token';

const NOW = Date.UTC(2026, 7, 21, 9, 0, 0);
const INPUT = {
  userId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  orgId: '11111111-1111-4111-8111-111111111111',
  familyId: 'ffffffff-1111-4111-8111-ffffffffffff',
  email: 'teacher@example.sa',
  now: NOW,
} as const;

let publicKey: SigningKey;
let privateKey: SigningKey;
let ring: Map<string, SigningKey>;
let token: string;

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA');
  publicKey = pair.publicKey;
  privateKey = pair.privateKey;
  ring = new Map([['k1', publicKey]]);
  token = await issueAccessToken(privateKey, 'k1', accessClaims(INPUT));
});

describe('the claims are the exact JSON the policies will read', () => {
  it('matches the GoTrue layout, flat, with the organisation in app_metadata', () => {
    const seconds = Math.floor(NOW / 1000);
    // Locked as a whole object on purpose: this is the byte level contract
    // with `request.jwt.claims`, and a later move to managed GoTrue holds only
    // if nothing here quietly drifts.
    expect(accessClaims(INPUT)).toEqual({
      iss: ISSUER,
      aud: 'authenticated',
      sub: INPUT.userId,
      iat: seconds,
      exp: seconds + ACCESS_LIFETIME_MS / 1000,
      role: 'authenticated',
      aal: 'aal1',
      session_id: INPUT.familyId,
      email: INPUT.email,
      phone: '',
      is_anonymous: false,
      app_metadata: { org_id: INPUT.orgId, provider: 'email', providers: ['email'] },
      user_metadata: {},
      amr: [{ method: 'password', timestamp: seconds }],
    });
  });
});

describe('the round trip', () => {
  it('verifies and hands back who this is', async () => {
    const outcome = await verifyAccessToken(token, ring, NOW + 60_000);
    if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
    expect(outcome.userId).toBe(INPUT.userId);
    expect(outcome.orgId).toBe(INPUT.orgId);
    expect(outcome.familyId).toBe(INPUT.familyId);
    expect(outcome.claims['role']).toBe('authenticated');
  });

  it('lives fifteen minutes plus the same tolerance the database side uses', async () => {
    const edge = NOW + ACCESS_LIFETIME_MS + CLOCK_TOLERANCE_MS;
    expect((await verifyAccessToken(token, ring, edge - 1_000)).ok).toBe(true);
    const after = await verifyAccessToken(token, ring, edge + 1_000);
    expect(after).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('forgeries, one refusal each', () => {
  const claims = () => accessClaims(INPUT);

  it('refuses another token type, so no other JWT we mint can impersonate this one', async () => {
    const confirm = await new SignJWT(claims())
      .setProtectedHeader({ alg: 'EdDSA', typ: 'confirm+jwt', kid: 'k1' })
      .sign(privateKey);
    expect(await verifyAccessToken(confirm, ring, NOW)).toEqual({
      ok: false,
      reason: 'wrong-type',
    });
  });

  it('refuses a MAC where a signature belongs, which is the classic confusion', async () => {
    const hmac = await new SignJWT(claims())
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: 'k1' })
      .sign(new TextEncoder().encode('0'.repeat(32)));
    expect(await verifyAccessToken(hmac, ring, NOW)).toEqual({
      ok: false,
      reason: 'wrong-algorithm',
    });
  });

  it('refuses alg none, hand built the way an attacker builds it', async () => {
    const [, payload] = token.split('.');
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'at+jwt', kid: 'k1' })).toString(
      'base64url',
    );
    expect(await verifyAccessToken(`${header}.${payload ?? ''}.`, ring, NOW)).toEqual({
      ok: false,
      reason: 'wrong-algorithm',
    });
  });

  it('refuses a kid we do not hold, and never resolves it anywhere else', async () => {
    const foreign = await issueAccessToken(privateKey, 'k9', claims());
    expect(await verifyAccessToken(foreign, ring, NOW)).toEqual({
      ok: false,
      reason: 'unknown-key',
    });
  });

  it('refuses a signature from somebody else holding the same algorithm', async () => {
    const other = await generateKeyPair('EdDSA');
    const forged = await issueAccessToken(other.privateKey, 'k1', claims());
    expect(await verifyAccessToken(forged, ring, NOW)).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('refuses a payload changed after signing', async () => {
    const [header, payload, signature] = token.split('.');
    const bytes = Buffer.from(payload ?? '', 'base64url');
    // Flip the organisation, byte for byte, keeping the length.
    const swapped = Buffer.from(
      bytes.toString('utf8').replace(INPUT.orgId, INPUT.orgId.replace('1', '2')),
      'utf8',
    ).toString('base64url');
    const outcome = await verifyAccessToken(
      `${header ?? ''}.${swapped}.${signature ?? ''}`,
      ring,
      NOW,
    );
    expect(outcome).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('refuses the wrong issuer and the wrong audience by name', async () => {
    const wrongIss = await issueAccessToken(privateKey, 'k1', { ...claims(), iss: 'somebody' });
    expect(await verifyAccessToken(wrongIss, ring, NOW)).toEqual({
      ok: false,
      reason: 'wrong-issuer',
    });
    const wrongAud = await issueAccessToken(privateKey, 'k1', { ...claims(), aud: 'somebody' });
    expect(await verifyAccessToken(wrongAud, ring, NOW)).toEqual({
      ok: false,
      reason: 'wrong-audience',
    });
  });

  it('refuses a valid signature over claims that describe nobody', async () => {
    const anon = await issueAccessToken(privateKey, 'k1', { ...claims(), role: 'anon' });
    expect(await verifyAccessToken(anon, ring, NOW)).toEqual({ ok: false, reason: 'bad-claims' });

    const orglessClaims: JWTPayload = { ...claims() };
    delete orglessClaims['app_metadata'];
    const orgless = await issueAccessToken(privateKey, 'k1', orglessClaims);
    expect(await verifyAccessToken(orgless, ring, NOW)).toEqual({
      ok: false,
      reason: 'bad-claims',
    });
  });

  it('refuses text that is not a token at all', async () => {
    expect(await verifyAccessToken('not a token', ring, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('the confirmation freshness rule', () => {
  it('is a strict day, measured from when the link was sent', () => {
    expect(confirmationFresh(NOW, NOW + CONFIRMATION_LIFETIME_MS - 1)).toBe(true);
    expect(confirmationFresh(NOW, NOW + CONFIRMATION_LIFETIME_MS)).toBe(false);
  });
});
