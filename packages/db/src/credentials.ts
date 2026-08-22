// Hashing a password, and answering a login without saying who exists.
//
// The decision itself is `checkLogin` in `packages/account`, proven without a
// database. This file does the two things that need one: the hash, and the
// throttle counter that has to survive between attempts.
//
// ARGON2ID AT THE OWASP MINIMUM, verified 2026-08-16 against the Password
// Storage cheat sheet: 19 MiB of memory, two iterations, one degree of
// parallelism. PLAN.md section 7 names Argon2id for the self hosted case and
// this is the self hosted case, because the auth provider the plan assumed is
// not in the picture.
//
// AND THE LIBRARY WAS CHOSEN BY A CONSTRAINT, NOT A PREFERENCE. The popular
// `argon2` package declares `install` and `prepare` scripts, and this repository
// allows build scripts for esbuild alone, so it would have failed the install
// outright rather than quietly working. `@node-rs/argon2` ships prebuilt
// binaries with no script and no dependencies, and its async form does the work
// off the event loop, which matters because a hash takes about 120 milliseconds
// [measured] and a synchronous one would stall every other request for that long.

import { createHash } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { hash, verify } from '@node-rs/argon2';
import { checkLogin, confirmationFresh, delayAfter } from '@transferchecker/account';
import type { LoginOutcome } from '@transferchecker/account';
import { credentials, loginAttempts } from './schema/credentials';
import { users } from './schema/users';
import type { Database } from './database';

/**
 * The OWASP minimum, verified 2026-08-16. Raising these needs no migration.
 *
 * The variant is NOT named here and that is deliberate rather than an omission.
 * The library exports it as an ambient const enum, which `verbatimModuleSyntax`
 * refuses to read, and reaching for a numeric literal to get around that would
 * put a magic 2 in the security critical line of the file. Argon2id is the
 * library's default [measured], and a test asserts the stored digest begins
 * `$argon2id$`, which proves the variant where a type annotation only claimed it.
 */
export const ARGON2 = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * A real hash of a value nobody knows, verified against when no account exists.
 *
 * NOT DECORATION. Skipping the hash for an unknown email makes that response
 * roughly a hundred milliseconds faster than a real one, and a response time
 * that differs by a hundred milliseconds is a directory of who has an account
 * here, readable by anybody with a list of addresses and a stopwatch. Comparing
 * against this costs exactly what a real comparison costs.
 *
 * It is a constant rather than computed at startup so the cost is paid by the
 * attempts and not by every process launch, and it is safe to have in the open:
 * it is the hash of random bytes that were discarded.
 */
export const DECOY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$7d25hz4795vQRwxlexz4sA$GrccqkS1BaOSXQT3OPMKBNZ4hwRAD5vXHoyuLJJ+pzA';

export const hashPassword = (password: string): Promise<string> => hash(password, ARGON2);

/** False rather than thrown for a malformed stored hash. A corrupt row is not a login. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/**
 * The key of a throttle row: the SHA-256 of the lowercased address.
 *
 * Lowercased because `Ahmed@school.sa` and `ahmed@school.sa` are one mailbox and
 * must share one counter, or the throttle is bypassed by changing the case.
 */
export const emailKey = (email: string): string =>
  createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex');

export interface LoginAttempt {
  readonly email: string;
  readonly password: string;
  readonly now: number;
}

export interface LoginResult {
  readonly outcome: LoginOutcome;
  /** Present only on success. The account that signed in. */
  readonly userId?: string;
  readonly orgId?: string;
}

/**
 * Attempts a sign in and records what happened.
 *
 * THE SHAPE OF THIS FUNCTION IS THE SECURITY PROPERTY, so it is worth reading
 * in order. The throttle is consulted first, for an identifier that may have no
 * account. A password is then verified against either the real hash or the
 * decoy, so both paths cost the same. Only after that does the answer depend on
 * anything real, and the two failures a caller can receive, "wrong" and "too
 * soon", are the same for an address that exists and one that never did.
 *
 * The caller must render both as one message. This returns the reason because
 * the server needs it for its own logs and its own back off, not because a
 * person should be told which one it was.
 */
export async function attemptLogin(db: Database, input: LoginAttempt): Promise<LoginResult> {
  const key = emailKey(input.email);

  const [throttle] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.emailHash, key))
    .limit(1);

  const [account] = await db
    .select({
      userId: users.id,
      orgId: users.orgId,
      passwordHash: credentials.passwordHash,
      confirmedAt: credentials.confirmedAt,
    })
    .from(users)
    .innerJoin(credentials, eq(credentials.userId, users.id))
    .where(eq(users.email, input.email.trim().toLowerCase()))
    .limit(1);

  // Always a real verification, against the decoy when there is nothing to
  // verify against. See DECOY_HASH.
  const passwordMatches = await verifyPassword(account?.passwordHash ?? DECOY_HASH, input.password);

  const outcome = checkLogin({
    attempts: {
      failures: throttle?.failures ?? 0,
      ...(throttle?.lastFailureAt == null
        ? {}
        : { lastFailureAt: throttle.lastFailureAt.getTime() }),
    },
    // An account that does not exist can never match, whatever the decoy said.
    passwordMatches: account !== undefined && passwordMatches,
    confirmed: account?.confirmedAt != null,
    now: input.now,
  });

  await recordAttempt(db, key, outcome, input.now);

  if (!outcome.ok) return { outcome };
  return { outcome, userId: account?.userId ?? '', orgId: account?.orgId ?? '' };
}

/**
 * Writes the counter, and does it for an address with no account too.
 *
 * A refusal that came from the throttle does NOT increment: the attempt never
 * reached a password, and counting it would let an attacker push a real user's
 * delay to the ceiling by hammering an endpoint that was already refusing them.
 */
async function recordAttempt(
  db: Database,
  key: string,
  outcome: LoginOutcome,
  now: number,
): Promise<void> {
  if (!outcome.ok && outcome.reason === 'too-soon') return;

  if (outcome.ok) {
    await db.delete(loginAttempts).where(eq(loginAttempts.emailHash, key));
    return;
  }

  await db
    .insert(loginAttempts)
    .values({ emailHash: key, failures: 1, lastFailureAt: new Date(now) })
    .onConflictDoUpdate({
      target: loginAttempts.emailHash,
      set: {
        failures: sql`${loginAttempts.failures} + 1`,
        lastFailureAt: new Date(now),
      },
    });
}

/** Setting or replacing a password. The only place a hash is written. */
export async function setPassword(
  db: Database,
  who: { readonly userId: string; readonly orgId: string },
  password: string,
  now: number,
): Promise<void> {
  const digest = await hashPassword(password);
  await db
    .insert(credentials)
    .values({
      userId: who.userId,
      orgId: who.orgId,
      passwordHash: digest,
      updatedAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: credentials.userId,
      set: { passwordHash: digest, updatedAt: new Date(now) },
    });
}

/** Clears throttle rows nobody is waiting on any more. Safe to run on a schedule. */
export async function forgetStaleAttempts(db: Database, now: number): Promise<void> {
  const horizon = new Date(now - delayAfter(Number.MAX_SAFE_INTEGER) - 60_000);
  await db.delete(loginAttempts).where(sql`${loginAttempts.lastFailureAt} < ${horizon}`);
}

/**
 * The address a user id belongs to, for minting claims on a refresh.
 *
 * The refresh endpoint holds a rotated family and nothing else: the client
 * never says who it is, and the access token's claims carry the email the way
 * GoTrue's do. Read fresh from `users` rather than copied into the session
 * row, so an address corrected in the profile is the one the next token says.
 */
export async function accountEmail(db: Database, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ?? null;
}

/**
 * What goes in `confirmation_token_hash`: the SHA-256 of the token, never the
 * token. The same reasoning as `hashToken` for refresh tokens: 256 bits of our
 * own randomness has no dictionary, so an unsalted fast hash is exactly right,
 * and a stolen backup of the column can confirm nobody because the lookup only
 * goes one way.
 */
export const hashConfirmationToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * Records that a confirmation link is out, at signup or on a resend.
 *
 * OVERWRITES any previous link, which is the supersession rule: the newest
 * email is the one whose link works. That is also the whole revocation story a
 * confirmation needs, since the token grants nothing but an idempotent
 * `confirmed_at`.
 */
export async function beginConfirmation(
  db: Database,
  input: { readonly userId: string; readonly token: string; readonly now: number },
): Promise<void> {
  await db
    .update(credentials)
    .set({
      confirmationTokenHash: hashConfirmationToken(input.token),
      confirmationSentAt: new Date(input.now),
    })
    .where(eq(credentials.userId, input.userId));
}

/**
 * What a resend needs to know before it burns the outstanding link.
 *
 * Two facts, and both decide a different refusal: an account already proven
 * needs no new link at all, and one that got a link seconds ago needs a wait
 * rather than a second copy. Read here rather than in the route because these
 * columns live on `credentials`, which only the auth service role may touch.
 *
 * A missing row reads as unconfirmed with no link out, which is the safe way
 * round: the caller then issues one instead of refusing a real account.
 */
export async function confirmationState(
  db: Database,
  userId: string,
): Promise<{ readonly confirmed: boolean; readonly sentAt: number | null }> {
  const [row] = await db
    .select({
      confirmedAt: credentials.confirmedAt,
      sentAt: credentials.confirmationSentAt,
    })
    .from(credentials)
    .where(eq(credentials.userId, userId))
    .limit(1);
  return {
    confirmed: row?.confirmedAt != null,
    sentAt: row?.sentAt == null ? null : row.sentAt.getTime(),
  };
}

export type ConfirmOutcome =
  /** The mailbox is proven and `confirmed_at` was just written. */
  | 'confirmed'
  /** Proven before this click. Shown as success: link scanners click first. */
  | 'already'
  | 'expired'
  /** No outstanding link matches. Also what a superseded link reads as. */
  | 'unknown';

/**
 * The confirm endpoint's whole decision, from the raw token in the link.
 *
 * The row is found BY the token's hash, so the URL carries the token and
 * nothing else: no email and no user id for a referrer header to leak. The
 * hash is NOT cleared on success, deliberately: corporate mail scanners open
 * links before people do, and burning the link on that first automated click
 * would show the actual teacher an error for a mailbox that just proved
 * itself. The link stays answerable until it expires or a resend replaces it,
 * and the second answer is `already`, which renders as success.
 */
export async function confirmEmail(
  db: Database,
  input: { readonly token: string; readonly now: number },
): Promise<ConfirmOutcome> {
  const [row] = await db
    .select({
      userId: credentials.userId,
      sentAt: credentials.confirmationSentAt,
      confirmedAt: credentials.confirmedAt,
    })
    .from(credentials)
    .where(eq(credentials.confirmationTokenHash, hashConfirmationToken(input.token)))
    .limit(1);
  if (row === undefined) return 'unknown';
  if (row.sentAt === null) return 'unknown';
  if (!confirmationFresh(row.sentAt.getTime(), input.now)) return 'expired';
  if (row.confirmedAt !== null) return 'already';

  // Guarded by `isNull` so a concurrent double click cannot move an already
  // written timestamp: the first writer wins and the second reads `already`.
  await db
    .update(credentials)
    .set({ confirmedAt: new Date(input.now) })
    .where(and(eq(credentials.userId, row.userId), isNull(credentials.confirmedAt)));
  return 'confirmed';
}
