// The access token: what the database is told about a caller, and how it knows.
//
// Every isolation policy in `packages/db` reads `auth.jwt()`, and nothing fills
// that in by itself. The server does, per request, from a token it has already
// verified. So this file is the other half of the isolation model: if a token
// could be forged or its claims read before its signature was checked, every
// policy in the schema would be decoration.
//
// ED25519 RATHER THAN HMAC, AND THE REASON IS WHO ELSE WILL VERIFY. A shared
// secret means anybody who can check a token can also mint one, and the next two
// things on the plan are an application server and a sync interface that may not
// be the same process. A public key lets a verifier be wrong about nothing and
// forge nothing. Ed25519 in particular has no parameter to get wrong (no key
// size, no curve choice, no padding mode) and its signatures are deterministic,
// so a weak random source cannot leak the private key the way a repeated nonce
// leaks an ECDSA one. Node signs and verifies it natively, with no dependency.
//
// THE ORDER OF THE CHECKS IS THE SECURITY PROPERTY, and it is the part of this
// file worth reviewing. The signature is verified BEFORE the payload is parsed.
// A verifier that reads claims first and checks the signature afterwards is one
// early return away from trusting an attacker's JSON, and that mistake has
// shipped in real libraries more than once.
//
// NO CLOCK IS READ HERE. `now` arrives as a parameter, as everywhere else in
// this package, so a test can sit exactly on the expiry second.

import { randomUUID, sign, verify } from 'node:crypto';
import { z } from 'zod';
import { decodeSegment, encodeSegment, readJson } from './jose';
import type { SigningKey, VerifyingKey } from './keyring';

/**
 * Fifteen minutes, and the number is a consequence rather than a preference.
 *
 * An access token is self contained, so nothing can withdraw one: signing out,
 * a password change and a detected theft all revoke the refresh family, and the
 * access token already in a thief's hand keeps working until it expires. That
 * window is the entire cost of the design, so it is kept short. Fifteen minutes
 * against a rotating refresh token costs a teacher four extra round trips an
 * hour, on requests they were making anyway.
 */
export const ACCESS_LIFETIME_MS = 15 * 60 * 1000;

export const ALGORITHM = 'EdDSA';

/**
 * `at+jwt`, from RFC 9068, and it is a defence rather than a label.
 *
 * It says this token is an access token and nothing else. The day a second kind
 * of signed token exists, a verifier that pins the type cannot be handed one in
 * place of the other, which is the confusion that makes cross token attacks work.
 */
export const TOKEN_TYPE = 'at+jwt';

/** The database role a request runs as. Read straight into `set local role`. */
export const TOKEN_ROLE = 'authenticated';

/** Who issued the token and who it is for. Both are deployment facts. */
export interface TokenNames {
  readonly issuer: string;
  readonly audience: string;
}

/** Everything a policy or a gate is allowed to learn from a token. */
export interface AccessClaims {
  readonly userId: string;
  readonly orgId: string;
  /**
   * Whether the mailbox is confirmed. Gates cloud sync and never the sign in.
   *
   * IT CAN BE STALE, AND IT FAILS CLOSED. A person who confirms their mailbox
   * in a browser is still holding an access token that says otherwise, for up to
   * its lifetime. That direction is the safe one: the claim is only ever wrong
   * by refusing something, never by allowing it. The remedy is one line in the
   * client, and it belongs there rather than in a longer lived token: when sync
   * is refused for an unconfirmed mailbox, refresh once and try again, because
   * the refresh reads the row.
   */
  readonly emailConfirmed: boolean;
}

export interface MintInput {
  readonly claims: AccessClaims;
  readonly key: SigningKey;
  readonly now: number;
  readonly names: TokenNames;
  readonly lifetimeMs?: number;
  /** Supplied only by tests. Otherwise a fresh uuid, so two tokens never share one. */
  readonly tokenId?: string;
}

/**
 * The header, checked with nothing allowed through that we did not write.
 *
 * Strict on purpose. RFC 7515 says a verifier must reject any `crit` header it
 * does not understand, and the shortest way to honour that, permanently, is to
 * refuse every member that is not one of these three.
 */
const HeaderSchema = z.strictObject({
  alg: z.literal(ALGORITHM),
  typ: z.literal(TOKEN_TYPE),
  kid: z.string().min(1),
});

/**
 * The payload, and deliberately NOT strict.
 *
 * A header member we did not write is an attack. A payload member we did not
 * write is a newer issuer adding a claim, and a verifier that refuses those
 * cannot be deployed before every issuer is upgraded.
 */
const PayloadSchema = z.object({
  iss: z.string().min(1),
  aud: z.string().min(1),
  sub: z.uuid(),
  jti: z.string().min(1),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
  role: z.literal(TOKEN_ROLE),
  app_metadata: z.object({
    org_id: z.uuid(),
    email_confirmed: z.boolean(),
  }),
});

/** Seconds since the epoch, which is what a JWT date is. */
const seconds = (ms: number): number => Math.floor(ms / 1000);

/**
 * Signs one access token.
 *
 * The organisation goes in `app_metadata` and nowhere else, because that is the
 * only place every policy in the schema reads it from, and the reason is written
 * where the policies are: `user_metadata` is writable by the user on the auth
 * APIs this schema was designed against, so a policy trusting it would let
 * anybody assign themselves any organisation.
 */
export function mintAccessToken(input: MintInput): string {
  const issuedAt = seconds(input.now);
  const header = { alg: ALGORITHM, typ: TOKEN_TYPE, kid: input.key.kid };
  const payload = {
    iss: input.names.issuer,
    aud: input.names.audience,
    sub: input.claims.userId,
    jti: input.tokenId ?? randomUUID(),
    iat: issuedAt,
    exp: seconds(input.now + (input.lifetimeMs ?? ACCESS_LIFETIME_MS)),
    role: TOKEN_ROLE,
    app_metadata: {
      org_id: input.claims.orgId,
      email_confirmed: input.claims.emailConfirmed,
    },
  };

  const signed = `${encodeSegment(JSON.stringify(header))}.${encodeSegment(JSON.stringify(payload))}`;
  const signature = sign(null, Buffer.from(signed, 'utf8'), input.key.privateKey);
  return `${signed}.${signature.toString('base64url')}`;
}

export type TokenRefusal =
  /** Not three segments, or a segment that is not canonical base64url JSON. */
  | 'malformed'
  /** `none`, `HS256`, or anything else that is not the one algorithm we sign with. */
  | 'wrong-algorithm'
  /** A key id we hold no public key for. A retired key stays listed until its last token expires. */
  | 'unknown-key'
  | 'bad-signature'
  | 'wrong-issuer'
  | 'wrong-audience'
  | 'expired'
  /** Issued in the future, which means an issuer's clock is wrong. */
  | 'not-yet-valid'
  /** Signed by us and still missing something a policy needs. */
  | 'bad-claims';

export type TokenCheck =
  | {
      readonly ok: true;
      readonly claims: AccessClaims;
      readonly expiresAt: number;
      /** The `jti`. Safe to log: it names a token without being one. */
      readonly tokenId: string;
    }
  | { readonly ok: false; readonly reason: TokenRefusal };

export interface CheckInput {
  readonly token: string;
  /** Every key whose tokens may still be live. The active one, and any retired. */
  readonly keys: readonly VerifyingKey[];
  readonly now: number;
  readonly names: TokenNames;
  /**
   * How far two machines' clocks may disagree. Zero by default, on purpose.
   *
   * One process signs and verifies today, so any tolerance would only widen the
   * life of a token for nothing. The day a second issuer runs on another host,
   * set this to the skew NTP actually leaves, which is milliseconds, and not to
   * the round number that feels safe.
   */
  readonly toleranceMs?: number;
}

/**
 * Verifies a token and returns what it says, or refuses and says why.
 *
 * READ THE ORDER. Nothing in the payload is looked at until the signature over
 * that exact payload has verified against a key we hold. Everything before that
 * point treats the token as an attacker's bytes, because that is what it is.
 */
export function checkAccessToken(input: CheckInput): TokenCheck {
  const parts = input.token.split('.');
  const [headerPart, payloadPart, signaturePart] = parts;
  if (parts.length !== 3 || headerPart === undefined || payloadPart === undefined) {
    return { ok: false, reason: 'malformed' };
  }
  if (signaturePart === undefined) return { ok: false, reason: 'malformed' };

  const headerBytes = decodeSegment(headerPart);
  const signature = decodeSegment(signaturePart);
  if (headerBytes === undefined || signature === undefined) {
    return { ok: false, reason: 'malformed' };
  }

  // The algorithm is read before the header is validated so that a token signed
  // with the wrong one, or with `none`, is reported as what it is. The value is
  // still never obeyed: it is compared against the single algorithm we accept.
  const announced = z.object({ alg: z.string() }).safeParse(readJson(headerBytes));
  if (!announced.success) return { ok: false, reason: 'malformed' };
  if (announced.data.alg !== ALGORITHM) return { ok: false, reason: 'wrong-algorithm' };

  const header = HeaderSchema.safeParse(readJson(headerBytes));
  if (!header.success) return { ok: false, reason: 'malformed' };

  const key = input.keys.find((candidate) => candidate.kid === header.data.kid);
  if (key === undefined) return { ok: false, reason: 'unknown-key' };

  const signed = Buffer.from(`${headerPart}.${payloadPart}`, 'utf8');
  if (!verified(signed, signature, key)) return { ok: false, reason: 'bad-signature' };

  // Only now is any of this our own data.
  const payloadBytes = decodeSegment(payloadPart);
  if (payloadBytes === undefined) return { ok: false, reason: 'malformed' };
  const payload = PayloadSchema.safeParse(readJson(payloadBytes));
  if (!payload.success) return { ok: false, reason: 'bad-claims' };

  const claimed = payload.data;
  if (claimed.iss !== input.names.issuer) return { ok: false, reason: 'wrong-issuer' };
  if (claimed.aud !== input.names.audience) return { ok: false, reason: 'wrong-audience' };

  const tolerance = input.toleranceMs ?? 0;
  if (input.now - tolerance >= claimed.exp * 1000) return { ok: false, reason: 'expired' };
  if (claimed.iat * 1000 - tolerance > input.now) return { ok: false, reason: 'not-yet-valid' };

  return {
    ok: true,
    claims: {
      userId: claimed.sub,
      orgId: claimed.app_metadata.org_id,
      emailConfirmed: claimed.app_metadata.email_confirmed,
    },
    expiresAt: claimed.exp * 1000,
    tokenId: claimed.jti,
  };
}

/**
 * False rather than thrown for a signature that does not check out.
 *
 * `verify` throws on a malformed signature and returns false on a wrong one, and
 * the caller has no use for the difference: both mean this token was not signed
 * by the key it names.
 */
function verified(signed: Buffer, signature: Buffer, key: VerifyingKey): boolean {
  try {
    return verify(null, signed, key.publicKey, signature);
  } catch {
    return false;
  }
}
