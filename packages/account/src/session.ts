// Refresh token rotation, and the one rule that makes it worth doing.
//
// PLAN section 7: "a rotating refresh token with reuse detection, where an old
// token used again means a stolen session and the whole family is revoked."
// That sentence is a state machine, and this is it, written as pure logic so it
// can be tested exhaustively without a database or a clock.
//
// WHY REUSE DETECTION IS THE WHOLE POINT. Rotation alone does not stop a thief;
// it only means the stolen token expires sooner. What stops them is that a
// stolen token and the real one cannot both be used: whichever presents the old
// token second is caught, and since neither the thief nor the user can know
// which of them went first, the theft is detected no matter who wins the race.
//
// AND WHY THE WHOLE FAMILY DIES. Revoking only the reused token would leave the
// thief holding whatever they rotated to. The family is every token descended
// from one login, so killing it logs out both parties, and the real user simply
// signs in again. Logging out a legitimate user is a small harm; leaving a
// thief signed in is the whole harm.
//
// NO CLOCK IS READ HERE. Every time arrives as a parameter, so a test can put
// the moment of expiry exactly where it wants it and the logic cannot depend on
// how fast the test ran.

/** One issued refresh token, as it is stored. */
export interface TokenRecord {
  /** The token itself, or a hash of it. This layer does not care which. */
  readonly id: string;
  /** Every token from one login shares this. Revocation works on the family. */
  readonly family: string;
  /** Milliseconds since the epoch. Supplied, never read from a clock. */
  readonly expiresAt: number;
  /** Set when this token has been exchanged for its successor. */
  readonly usedAt?: number;
}

export interface Family {
  readonly id: string;
  readonly revokedAt?: number;
}

export type RefusalReason =
  | 'unknown-token'
  | 'expired'
  | 'family-revoked'
  /** The one that matters: a token that was already exchanged, presented again. */
  | 'reused';

export type RefreshOutcome =
  | { readonly ok: true; readonly issue: { readonly family: string; readonly expiresAt: number } }
  | { readonly ok: false; readonly reason: RefusalReason; readonly revokeFamily?: string };

export interface RefreshInput {
  readonly presented: string;
  readonly now: number;
  /** How long the successor lives, in milliseconds. */
  readonly lifetimeMs: number;
  readonly tokens: ReadonlyMap<string, TokenRecord>;
  readonly families: ReadonlyMap<string, Family>;
}

/**
 * Decides what happens when a refresh token is presented.
 *
 * The order of the checks is load bearing and is the part worth reviewing.
 * REUSE IS CHECKED BEFORE EXPIRY, because a thief presenting a token that is
 * both used and expired is still a thief, and answering "expired" would throw
 * away the only evidence of the theft that will ever exist. Expiry is a
 * housekeeping answer; reuse is an alarm.
 *
 * A revoked family is checked first only because a family already known to be
 * compromised needs no further diagnosis.
 */
export function refresh(input: RefreshInput): RefreshOutcome {
  const record = input.tokens.get(input.presented);
  if (record === undefined) return { ok: false, reason: 'unknown-token' };

  const family = input.families.get(record.family);
  if (family?.revokedAt !== undefined) return { ok: false, reason: 'family-revoked' };

  // Before expiry, deliberately. See above.
  if (record.usedAt !== undefined) {
    return { ok: false, reason: 'reused', revokeFamily: record.family };
  }

  if (record.expiresAt <= input.now) return { ok: false, reason: 'expired' };

  return {
    ok: true,
    issue: { family: record.family, expiresAt: input.now + input.lifetimeMs },
  };
}

/**
 * The store side of a successful refresh, as a value rather than as a mutation.
 *
 * Two things happen together and must not come apart: the presented token is
 * marked used and the successor is written. If a crash could land between them,
 * either the user is logged out for nothing or the old token stays valid and
 * rotation has quietly stopped happening. Returning both as one value is what
 * lets the caller write them in one transaction.
 */
export function rotate(
  presented: TokenRecord,
  successorId: string,
  now: number,
  lifetimeMs: number,
): { readonly used: TokenRecord; readonly issued: TokenRecord } {
  return {
    used: { ...presented, usedAt: now },
    issued: {
      id: successorId,
      family: presented.family,
      expiresAt: now + lifetimeMs,
    },
  };
}

/**
 * Everything to invalidate when a reuse is seen.
 *
 * The whole family, including the token that was just presented and the one it
 * was exchanged for. Returning the ids rather than performing the deletion
 * keeps this testable and keeps the transaction in one place.
 */
export function familyMembers(
  tokens: ReadonlyMap<string, TokenRecord>,
  family: string,
): readonly string[] {
  return [...tokens.values()].filter((token) => token.family === family).map((token) => token.id);
}
