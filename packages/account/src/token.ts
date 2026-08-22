// The access token: issued by us, verified by us, shaped like GoTrue's.
//
// THE SHAPE IS THE DECISION WORTH EXPLAINING. Every claim sits flat at the top
// level with the organisation inside `app_metadata`, byte for byte the layout
// GoTrue issues and PostgREST copies into `request.jwt.claims`, because that is
// the JSON every row level security policy in this schema already reads and the
// tests already inject. Our own app server will run
// `set_config('request.jwt.claims', <this payload>, true)` and `SET ROLE
// authenticated`, which replicates managed Supabase exactly, so a later move to
// a managed GoTrue rewrites no policy and no test. A prettier custom shape was
// rejected for exactly that reason.
//
// JWT RATHER THAN PASETO, WITH THE ATTACKS CLOSED BY CONFIGURATION. With one
// first party verifier, everything PASETO prevents structurally is prevented
// here by pinning: exactly one accepted algorithm (EdDSA over Ed25519, RFC
// 8725 section 3.1), an explicit token type (`at+jwt`, RFC 9068) so no other
// JWT this product ever mints can pass as an access token, exact issuer and
// audience matching, and keys resolved only through a caller supplied map so
// the attacker controlled `kid` header is an opaque lookup, never a path. The
// maintained-library argument settled the rest: the flagship Node PASETO
// implementation is archived, while `jose` is zero dependency, pure JS, and
// lets the clock be injected, which keeps this package's no-clock rule.
//
// FIFTEEN MINUTES, BECAUSE REVOCATION LIVES IN THE REFRESH LAYER. An access
// token is never revoked individually; the rotating refresh token with reuse
// detection is what ends a session, and the lifetime bounds how long that
// takes to matter. There is no `jti` for the same reason: a denylist nobody
// keeps is a claim that lies about a capability.

import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import type { webcrypto } from 'node:crypto';

/**
 * The key type this module signs and verifies with.
 *
 * Named here because the global `CryptoKey` exists as a VALUE in this runtime
 * while its TYPE does not resolve under this tsconfig, and `node:crypto`'s
 * `webcrypto` namespace is the one spelling that does. Type only, so nothing
 * from node:crypto survives into the emitted logic of this clock-free package.
 */
export type SigningKey = webcrypto.CryptoKey;

/** Fixed and exact matched. Policies never read it; our verifier requires it. */
export const ISSUER = 'transferchecker';

/**
 * GoTrue's audience for signed in users, kept verbatim.
 *
 * Our verifier MUST check it even though the database side never will:
 * PostgREST with `jwt-aud` unset accepts any audience, so the check either
 * happens here or nowhere.
 */
export const AUDIENCE = 'authenticated';

export const ACCESS_LIFETIME_MS = 15 * 60_000;

/** Mirrors PostgREST's own tolerance, so the two verifiers agree at the edge. */
export const CLOCK_TOLERANCE_MS = 30_000;

export interface AccessInput {
  readonly userId: string;
  readonly orgId: string;
  /** The refresh token family. Stable across rotation, like GoTrue's session. */
  readonly familyId: string;
  readonly email: string;
  readonly now: number;
}

/**
 * The payload, as pure data. Separated from signing so a test can hold the
 * exact JSON the policies will read without touching a key.
 */
export function accessClaims(input: AccessInput): JWTPayload {
  const seconds = Math.floor(input.now / 1000);
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: input.userId,
    iat: seconds,
    exp: seconds + ACCESS_LIFETIME_MS / 1000,
    role: 'authenticated',
    aal: 'aal1',
    session_id: input.familyId,
    email: input.email,
    // Empty string rather than absent, matching GoTrue's serialisation.
    phone: '',
    is_anonymous: false,
    // The ONLY place an organisation may come from. `app_metadata` is the
    // admin written half; policies that read anything user editable would be
    // handing out other people's rows.
    app_metadata: { org_id: input.orgId, provider: 'email', providers: ['email'] },
    user_metadata: {},
    amr: [{ method: 'password', timestamp: seconds }],
  };
}

/** The token type, checked on verification so no other JWT can impersonate it. */
const TOKEN_TYPE = 'at+jwt';

export async function issueAccessToken(
  privateKey: SigningKey,
  kid: string,
  claims: JWTPayload,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', typ: TOKEN_TYPE, kid })
    .sign(privateKey);
}

export type VerifyRefusal =
  | 'malformed'
  /** The `kid` names no key we hold. Never resolved outside the given map. */
  | 'unknown-key'
  | 'wrong-type'
  | 'wrong-algorithm'
  | 'bad-signature'
  | 'expired'
  | 'wrong-issuer'
  | 'wrong-audience'
  /** Verified, and still refused: the claims are not a signed in teacher's. */
  | 'bad-claims';

export type VerifyOutcome =
  | {
      readonly ok: true;
      readonly userId: string;
      readonly orgId: string;
      readonly familyId: string;
      /** The whole verified payload, verbatim, for `request.jwt.claims`. */
      readonly claims: JWTPayload;
    }
  | { readonly ok: false; readonly reason: VerifyRefusal };

/** Thrown by the key resolver, caught below. Never leaves this file. */
class UnknownKey extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Verifies an access token, as data and never as an exception.
 *
 * The order of enforcement is jose's, and what this file adds on top is the
 * part signature checks cannot: that the verified claims actually describe a
 * signed in teacher of some organisation. A valid signature over `role:
 * "anon"` is not a session.
 */
export async function verifyAccessToken(
  token: string,
  keys: ReadonlyMap<string, SigningKey>,
  now: number,
): Promise<VerifyOutcome> {
  try {
    const { payload } = await jwtVerify(
      token,
      (header) => {
        const key = keys.get(header.kid ?? '');
        if (key === undefined) throw new UnknownKey();
        return key;
      },
      {
        algorithms: ['EdDSA'],
        typ: TOKEN_TYPE,
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: new Date(now),
        clockTolerance: CLOCK_TOLERANCE_MS / 1000,
      },
    );

    const metadata = payload['app_metadata'];
    const orgId = isRecord(metadata) ? metadata['org_id'] : undefined;
    if (
      payload['role'] !== 'authenticated' ||
      typeof payload.sub !== 'string' ||
      payload.sub === '' ||
      typeof orgId !== 'string' ||
      orgId === '' ||
      typeof payload['session_id'] !== 'string'
    ) {
      return { ok: false, reason: 'bad-claims' };
    }
    return {
      ok: true,
      userId: payload.sub,
      orgId,
      familyId: payload['session_id'],
      claims: payload,
    };
  } catch (error) {
    return { ok: false, reason: refusalOf(error) };
  }
}

/** jose's typed errors, measured rather than assumed, mapped to the union. */
function refusalOf(error: unknown): VerifyRefusal {
  if (error instanceof UnknownKey) return 'unknown-key';
  const code = isRecord(error) ? error['code'] : undefined;
  switch (code) {
    case 'ERR_JWT_EXPIRED':
      return 'expired';
    case 'ERR_JOSE_ALG_NOT_ALLOWED':
      // Both a token claiming HS256 and a hand built `alg: none` land here,
      // which is the algorithm confusion family closed in one place.
      return 'wrong-algorithm';
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
      return 'bad-signature';
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED': {
      const claim = isRecord(error) ? error['claim'] : undefined;
      if (claim === 'typ') return 'wrong-type';
      if (claim === 'iss') return 'wrong-issuer';
      if (claim === 'aud') return 'wrong-audience';
      return 'bad-claims';
    }
    default:
      return 'malformed';
  }
}
