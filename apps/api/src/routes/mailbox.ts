// Redeeming a confirmation link, and asking for another one.
//
// BOTH ROUTES ANSWER THE SAME THING TO EVERYBODY, for two different reasons.
//
// A redemption that succeeded and one that had already succeeded return the
// identical body, because a corporate mail gateway opens every link in a message
// before a human sees it, and the person who clicks second must be told it
// worked rather than shown an error about a link that did its job.
//
// A resend answers 202 whether or not the address has an account, whether or not
// that account is already confirmed, and whether or not a mail was actually
// sent. Any difference between those is an answer to "does this person have an
// account here", which is the question the whole authentication path is written
// not to answer.

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  asAuth,
  mayResendTo,
  issueConfirmation,
  newSecret,
  redeemConfirmation,
  schema,
} from '@transferchecker/db';
import { RULES } from '../limits';
import { refuse, throttled } from '../context';
import type { ApiContext, Reply, RouteInput } from '../context';
import { deliver } from './signup';

const ConfirmBody = z.object({ token: z.string().min(1).max(512) });
const ResendBody = z.object({ email: z.string().trim().min(3).max(254) });

/** One body for a link that worked and for one that had already worked. */
const CONFIRMED: Reply = { status: 200, body: { state: 'confirmed' } };

export const confirm = async (context: ApiContext, input: RouteInput): Promise<Reply> => {
  const limited = throttled(context, RULES.confirm, `confirm:${input.address}`, input);
  if (limited !== undefined) return limited;

  const body = ConfirmBody.safeParse(input.body);
  if (!body.success) return refuse(400, 'invalid-request');

  const outcome = await asAuth(context.db, (tx) =>
    redeemConfirmation(tx, { secret: body.data.token, now: input.now }),
  );

  if (outcome.state === 'confirm') {
    context.log('confirm: mailbox proved');
    return CONFIRMED;
  }
  if (outcome.state === 'already') {
    context.log('confirm: already proved, answered the same');
    return CONFIRMED;
  }

  context.log(`confirm: refused, ${outcome.reason}`);
  return refuse(400, outcome.reason);
};

/** The reply every caller gets, whatever was or was not sent. */
const ACCEPTED: Reply = { status: 202, body: { status: 'confirm-your-mailbox' } };

export const resend = async (context: ApiContext, input: RouteInput): Promise<Reply> => {
  const limited = throttled(context, RULES.resend, `resend:${input.address}`, input);
  if (limited !== undefined) return limited;

  const body = ResendBody.safeParse(input.body);
  if (!body.success) return refuse(400, 'invalid-request');

  const secret = newSecret();
  const sending = await asAuth(context.db, async (tx) => {
    const [account] = await tx
      .select({
        id: schema.users.id,
        orgId: schema.users.orgId,
        email: schema.users.email,
        locale: schema.users.locale,
        confirmedAt: schema.credentials.confirmedAt,
      })
      .from(schema.users)
      .innerJoin(schema.credentials, eq(schema.credentials.userId, schema.users.id))
      .where(eq(schema.users.email, body.data.email.trim().toLowerCase()))
      .limit(1);

    // No account, or a mailbox already proved. Both stop here and both look
    // exactly like the case that continues.
    if (account?.confirmedAt !== null) return undefined;

    const allowed = await mayResendTo(tx, account.id, input.now);
    if (!allowed.ok) return undefined;

    await issueConfirmation(tx, {
      userId: account.id,
      orgId: account.orgId,
      email: account.email,
      secret,
      now: input.now,
    });
    return { email: account.email, locale: account.locale };
  });

  if (sending === undefined) {
    context.log('resend: nothing to send, answered the same');
    return ACCEPTED;
  }

  await deliver(context, sending.email, sending.locale, secret, input.now);
  return ACCEPTED;
};
