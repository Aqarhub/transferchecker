// Where the mailbox rules meet rows.
//
// The rules are not restated here and must not be. `checkConfirmation` decides,
// in pure logic, and this file feeds it three facts and writes down what it
// decided. The one thing worth repeating as a comment, because the ordering of
// this file protects it: THE DECISION AND THE WRITE ARE ONE TRANSACTION. A link
// marked used without the mailbox being confirmed is a person locked out of sync
// with no way back; a mailbox confirmed without the link being marked used is a
// link that keeps working after it should not.

import { and, asc, count, desc, eq, gte, lt } from 'drizzle-orm';
import { checkConfirmation, mayResend } from '@transferchecker/account';
import type { ConfirmOutcome, ResendOutcome } from '@transferchecker/account';
import { CONFIRMATION_LIFETIME_MS, RESEND_WINDOW_MS } from '@transferchecker/account';
import { credentials } from './schema/credentials';
import { emailVerifications } from './schema/verifications';
import { users } from './schema/users';
import { hashSecret } from './secret';
import type { Database } from './database';

export interface IssueConfirmation {
  readonly userId: string;
  readonly orgId: string;
  /** The address the mail is going to. Stored, and compared again at redemption. */
  readonly email: string;
  /** The raw secret that goes in the link. Only its hash is written. */
  readonly secret: string;
  readonly now: number;
  readonly lifetimeMs?: number;
}

/** When a link expires, so the message and the row cannot disagree about it. */
export const expiryOf = (input: IssueConfirmation): number =>
  input.now + (input.lifetimeMs ?? CONFIRMATION_LIFETIME_MS);

/**
 * Records one issued link.
 *
 * It does not send anything. Sending is a service nobody has chosen yet, and
 * this is deliberately the half of the flow that does not depend on which one.
 * The address is lowercased on the way in for the same reason the login throttle
 * lowercases: one mailbox must not become two rows.
 */
export async function issueConfirmation(db: Database, input: IssueConfirmation): Promise<void> {
  await db.insert(emailVerifications).values({
    id: hashSecret(input.secret),
    userId: input.userId,
    orgId: input.orgId,
    email: input.email.trim().toLowerCase(),
    expiresAt: new Date(expiryOf(input)),
    createdAt: new Date(input.now),
  });
}

/**
 * Whether another confirmation mail may go to this person.
 *
 * The counting is here and the rule is in `packages/account`, which is what lets
 * the ceiling be tested at its boundary without a database.
 */
export async function mayResendTo(
  db: Database,
  userId: string,
  now: number,
): Promise<ResendOutcome> {
  const since = new Date(now - RESEND_WINDOW_MS);
  const inWindow = and(
    eq(emailVerifications.userId, userId),
    gte(emailVerifications.createdAt, since),
  );

  const [counted] = await db.select({ issued: count() }).from(emailVerifications).where(inWindow);

  // Ordered reads rather than `min` and `max`, so the driver maps the column to
  // a Date the way it does everywhere else instead of handing back whatever an
  // aggregate happens to produce.
  const [oldest] = await db
    .select({ createdAt: emailVerifications.createdAt })
    .from(emailVerifications)
    .where(inWindow)
    .orderBy(asc(emailVerifications.createdAt))
    .limit(1);

  const [latest] = await db
    .select({ createdAt: emailVerifications.createdAt })
    .from(emailVerifications)
    .where(eq(emailVerifications.userId, userId))
    .orderBy(desc(emailVerifications.createdAt))
    .limit(1);

  return mayResend({
    issuedInWindow: counted?.issued ?? 0,
    ...(latest === undefined ? {} : { lastIssuedAt: latest.createdAt.getTime() }),
    ...(oldest === undefined ? {} : { oldestIssuedAt: oldest.createdAt.getTime() }),
    now,
  });
}

export interface RedeemInput {
  /** The raw secret out of the link. */
  readonly secret: string;
  readonly now: number;
}

/**
 * Redeems a confirmation link, or refuses and says why.
 *
 * Returns the account layer's own outcome unchanged, so the page renders one
 * vocabulary whether the decision came from memory or from a table.
 *
 * A LINK FOR AN ACCOUNT WITH NO CREDENTIAL ROW READS AS UNKNOWN, which is worth
 * naming because it looks like a hole and is not one. Signup writes the profile
 * and the password together; an account with neither cannot be signed into, so a
 * link that confirms its mailbox would confirm nothing anybody could use. The
 * alternative, inventing a credential row here, would create an account with a
 * confirmed mailbox and no password out of a link in a mail.
 */
export async function redeemConfirmation(
  db: Database,
  input: RedeemInput,
): Promise<ConfirmOutcome> {
  const id = hashSecret(input.secret);

  return db.transaction(async (tx) => {
    const [link] = await tx
      .select()
      .from(emailVerifications)
      .where(eq(emailVerifications.id, id))
      .limit(1);
    if (link === undefined) return { state: 'refuse', reason: 'unknown-link' };

    const [account] = await tx
      .select({ email: users.email, confirmedAt: credentials.confirmedAt })
      .from(users)
      .innerJoin(credentials, eq(credentials.userId, users.id))
      .where(eq(users.id, link.userId))
      .limit(1);
    if (account === undefined) return { state: 'refuse', reason: 'unknown-link' };

    const outcome = checkConfirmation({
      record: {
        id: link.id,
        userId: link.userId,
        email: link.email,
        expiresAt: link.expiresAt.getTime(),
        ...(link.usedAt === null ? {} : { usedAt: link.usedAt.getTime() }),
      },
      currentEmail: account.email,
      ...(account.confirmedAt === null ? {} : { confirmedAt: account.confirmedAt.getTime() }),
      now: input.now,
    });

    if (outcome.state !== 'confirm') return outcome;

    await tx
      .update(emailVerifications)
      .set({ usedAt: new Date(input.now) })
      .where(eq(emailVerifications.id, id));
    await tx
      .update(credentials)
      .set({ confirmedAt: new Date(input.now) })
      .where(eq(credentials.userId, link.userId));
    return outcome;
  });
}

/**
 * Clears links nobody can use any more. Safe to run on a schedule.
 *
 * Expired rows are deleted rather than kept, unlike a revoked token family. The
 * family is evidence of a theft and is the only record that one happened; an
 * unclicked link that went stale is evidence of nothing, and keeping it is
 * keeping an address that is already written down on the profile.
 *
 * TWO CONDITIONS, NOT ONE, AND THE SECOND IS THE ONE THAT IS EASY TO MISS. These
 * rows are also the resend counter, so deleting one that is still inside the
 * ceiling's window would hand back a slot. Today the lifetime and the window are
 * both a day and the two conditions agree; the day somebody shortens the link
 * lifetime they stop agreeing, silently, and the ceiling quietly stops counting.
 */
export async function forgetStaleConfirmations(db: Database, now: number): Promise<void> {
  await db
    .delete(emailVerifications)
    .where(
      and(
        lt(emailVerifications.expiresAt, new Date(now)),
        lt(emailVerifications.createdAt, new Date(now - RESEND_WINDOW_MS)),
      ),
    );
}
