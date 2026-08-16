// Signing in, and what a caller walks away holding.
//
// Three things already existed and none of them talked to the others: the login
// decision with its throttle and its decoy hash, the refresh token family with
// its reuse alarm, and the access token that carries an organisation into a
// policy. This file is the join, and it is the last piece of the authentication
// the plan asks for.
//
// TWO TOKENS BECAUSE THEY FAIL DIFFERENTLY. The access token is self contained,
// so nothing can withdraw one and it is kept short. The refresh token is a row,
// so it can be revoked the instant a theft is detected, and it is what actually
// carries a session across a week of aeroplane mode. Neither works as both.
//
// AND ONE REFUSAL, WHATEVER WENT WRONG. `wrong` covers a password that did not
// match and an address that has no account, because the pair of them is the leak
// the whole login path is written around. The reason returned here is for the
// server's own log, and the person is shown one sentence.

import { eq } from 'drizzle-orm';
import { ACCESS_LIFETIME_MS, mintAccessToken } from '@transferchecker/account';
import type { RefusalReason, TokenSetup } from '@transferchecker/account';
import { attemptLogin } from './credentials';
import { credentials } from './schema/credentials';
import { tokenFamilies } from './schema/sessions';
import { refreshSession, startSession } from './session';
import { newSecret } from './secret';
import { uuidv7 } from './uuidv7';
import type { Database } from './database';

/**
 * Thirty days, and acceptance criterion 3 is the floor under it.
 *
 * The product promises a week of aeroplane mode followed by a successful sync,
 * so a refresh token that expires inside that week would break the criterion by
 * arithmetic rather than by any bug. Thirty leaves room for a school holiday.
 * Rotation is what makes the length affordable: every use replaces it, so the
 * token that is thirty days old is one that has been exchanged all along.
 */
export const REFRESH_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface Grant {
  /** Held in memory only. Never in AsyncStorage, per PLAN section 7. */
  readonly accessToken: string;
  /** Goes to the Keychain or the Keystore, and nowhere else. */
  readonly refreshToken: string;
  readonly accessExpiresAt: number;
  readonly refreshExpiresAt: number;
  readonly userId: string;
  readonly orgId: string;
  /** Reported rather than enforced. It gates cloud sync and never the sign in. */
  readonly emailConfirmed: boolean;
}

export interface Lifetimes {
  readonly accessMs?: number;
  readonly refreshMs?: number;
}

export interface SignInInput {
  readonly email: string;
  readonly password: string;
  readonly now: number;
  /** What the person would recognise the session as. Not a user agent, not an IP. */
  readonly deviceLabel?: string;
}

export type SignInResult =
  | { readonly ok: true; readonly grant: Grant }
  /** Wrong password, or no such account. The caller must not distinguish them. */
  | { readonly ok: false; readonly reason: 'wrong' }
  | { readonly ok: false; readonly reason: 'too-soon'; readonly retryInMs: number };

/**
 * A password in, a session out.
 *
 * The order is `attemptLogin` first and always: it consults the throttle before
 * anything else and it hashes on every path, including the one where the address
 * has no account. Nothing here may run before it, or the timing of this endpoint
 * becomes a directory of who has an account.
 */
export async function signIn(
  db: Database,
  input: SignInInput,
  setup: TokenSetup,
  lifetimes: Lifetimes = {},
): Promise<SignInResult> {
  const attempt = await attemptLogin(db, {
    email: input.email,
    password: input.password,
    now: input.now,
  });

  if (!attempt.outcome.ok) {
    return attempt.outcome.reason === 'too-soon'
      ? { ok: false, reason: 'too-soon', retryInMs: attempt.outcome.retryInMs }
      : { ok: false, reason: 'wrong' };
  }

  const userId = attempt.userId ?? '';
  const orgId = attempt.orgId ?? '';
  const refreshToken = newSecret();
  const refreshMs = lifetimes.refreshMs ?? REFRESH_LIFETIME_MS;

  await startSession(db, {
    familyId: uuidv7({ now: input.now }),
    orgId,
    userId,
    token: refreshToken,
    now: input.now,
    lifetimeMs: refreshMs,
    ...(input.deviceLabel === undefined ? {} : { deviceLabel: input.deviceLabel }),
  });

  return {
    ok: true,
    grant: issue({
      userId,
      orgId,
      emailConfirmed: attempt.outcome.confirmed,
      refreshToken,
      refreshExpiresAt: input.now + refreshMs,
      now: input.now,
      setup,
      accessMs: lifetimes.accessMs ?? ACCESS_LIFETIME_MS,
    }),
  };
}

export type RenewResult =
  | { readonly ok: true; readonly grant: Grant }
  | { readonly ok: false; readonly reason: RefusalReason };

/**
 * A refresh token in, a new pair out, and the old one dead.
 *
 * THE MAILBOX FLAG IS RE-READ HERE, which is the reason a client that is told to
 * confirm its mailbox should refresh once and try again rather than ask the
 * person to sign in. Confirmation happens in a browser and the app is still
 * holding a token that says otherwise; this is where that gets corrected.
 */
export async function renew(
  db: Database,
  input: { readonly presented: string; readonly now: number },
  setup: TokenSetup,
  lifetimes: Lifetimes = {},
): Promise<RenewResult> {
  const successor = newSecret();
  const refreshMs = lifetimes.refreshMs ?? REFRESH_LIFETIME_MS;

  const outcome = await refreshSession(db, {
    presented: input.presented,
    successor,
    now: input.now,
    lifetimeMs: refreshMs,
  });
  if (!outcome.ok) return { ok: false, reason: outcome.reason };

  // The family names the person. Read after the exchange rather than before,
  // because the exchange is the thing that decides whether there is a session at
  // all, and a lookup before it would run for a token that turns out to be stolen.
  const [family] = await db
    .select({ userId: tokenFamilies.userId, orgId: tokenFamilies.orgId })
    .from(tokenFamilies)
    .where(eq(tokenFamilies.id, outcome.issue.family))
    .limit(1);
  if (family === undefined) return { ok: false, reason: 'unknown-token' };

  const [credential] = await db
    .select({ confirmedAt: credentials.confirmedAt })
    .from(credentials)
    .where(eq(credentials.userId, family.userId))
    .limit(1);

  return {
    ok: true,
    grant: issue({
      userId: family.userId,
      orgId: family.orgId,
      emailConfirmed: credential?.confirmedAt != null,
      refreshToken: successor,
      refreshExpiresAt: outcome.issue.expiresAt,
      now: input.now,
      setup,
      accessMs: lifetimes.accessMs ?? ACCESS_LIFETIME_MS,
    }),
  };
}

interface IssueInput {
  readonly userId: string;
  readonly orgId: string;
  readonly emailConfirmed: boolean;
  readonly refreshToken: string;
  readonly refreshExpiresAt: number;
  readonly now: number;
  readonly setup: TokenSetup;
  readonly accessMs: number;
}

/** The one place an access token is minted, so its claims cannot drift by path. */
function issue(input: IssueInput): Grant {
  const claims = {
    userId: input.userId,
    orgId: input.orgId,
    emailConfirmed: input.emailConfirmed,
  };
  return {
    accessToken: mintAccessToken({
      claims,
      key: input.setup.keyring.active,
      now: input.now,
      names: input.setup.names,
      lifetimeMs: input.accessMs,
    }),
    refreshToken: input.refreshToken,
    // Seconds on the wire, so the expiry a client is told is the one the token
    // carries rather than one computed here that could be a millisecond out.
    accessExpiresAt: Math.floor((input.now + input.accessMs) / 1000) * 1000,
    refreshExpiresAt: input.refreshExpiresAt,
    userId: input.userId,
    orgId: input.orgId,
    emailConfirmed: input.emailConfirmed,
  };
}
