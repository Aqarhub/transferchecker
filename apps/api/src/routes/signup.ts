// Creating an account, and the answer that is the same either way.
//
// AN ADDRESS THAT ALREADY HAS AN ACCOUNT GETS THE SAME REPLY AS ONE THAT DOES
// NOT, and this is the whole shape of the route. A signup form that says "this
// email is taken" is a directory: type ten thousand addresses, keep the ones
// that are taken, and you have a list of this product's customers. It is the
// same leak the sign in path spends a decoy hash to avoid, and it would be
// pointless to close it there and leave it open here.
//
// THE PRICE IS PAID HONESTLY. Somebody who forgot they have an account is told
// to check their mail and finds nothing waiting, because no second account was
// made. The remedy is the sign in screen, and one day a message to the existing
// address saying somebody tried, which is what the mail service will allow.
//
// AND NO TOKEN IS RETURNED HERE, which follows from the same rule. Handing back
// a session would answer the question this reply is written not to answer. The
// client signs in with the password it just chose, on the one route that mints.

import { eq } from 'drizzle-orm';
import {
  CONFIRMATION_LIFETIME_MS,
  SignupSchema,
  checkSignup,
  confirmationLink,
  confirmationMail,
} from '@transferchecker/account';
import {
  asAuth,
  createAccount,
  issueConfirmation,
  newSecret,
  schema,
  setPassword,
  uuidv7,
} from '@transferchecker/db';
import { refuse, versionFor } from '../context';
import type { ApiContext, Reply, RouteInput } from '../context';

/** The reply every caller gets, whatever happened. */
const ACCEPTED: Reply = { status: 202, body: { status: 'confirm-your-mailbox' } };

type Outcome = 'taken' | 'created' | { readonly stale: 'privacy' | 'terms' };

/** PostgreSQL's unique violation, which is what a signup race looks like. */
function isDuplicate(error: unknown): boolean {
  let cursor: unknown = error;
  while (cursor instanceof Error) {
    if ('code' in cursor && cursor.code === '23505') return true;
    cursor = cursor.cause;
  }
  return false;
}

export const signup = async (context: ApiContext, input: RouteInput): Promise<Reply> => {
  const decided = checkSignup(input.body, {
    languages: context.languages,
    currentPolicyVersion: versionFor(context.policy),
  });

  // The only 400 this route can produce, and it is about what was typed rather
  // than about who exists. The breach check is not run here: it is a network
  // call to a third party, and `packages/account` holds the two halves that
  // make it safe for whoever adds it.
  if (!decided.ok) return refuse(400, 'invalid-signup', { problems: decided.problems });

  // Re-read for the password alone. `checkSignup` returns what an account IS and
  // deliberately does not carry a secret through its result.
  const submitted = SignupSchema.safeParse(input.body);
  if (!submitted.success) return refuse(400, 'invalid-signup', { problems: [] });

  const account = decided.account;
  const ids = {
    userId: uuidv7({ now: input.now, sequence: 0 }),
    orgId: uuidv7({ now: input.now, sequence: 1 }),
    consentIds: [
      uuidv7({ now: input.now, sequence: 2 }),
      uuidv7({ now: input.now, sequence: 3 }),
    ] as const,
  };
  const secret = newSecret();

  let outcome: Outcome;
  try {
    outcome = await asAuth(context.db, async (tx): Promise<Outcome> => {
      const [existing] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, account.email))
        .limit(1);
      if (existing !== undefined) return 'taken';

      const plan = await createAccount(tx, account, ids, context.policy, input.now);
      if (!plan.ok) return { stale: plan.document };

      await setPassword(
        tx,
        { userId: ids.userId, orgId: ids.orgId },
        submitted.data.password,
        input.now,
      );
      await issueConfirmation(tx, {
        userId: ids.userId,
        orgId: ids.orgId,
        email: account.email,
        secret,
        now: input.now,
      });
      return 'created';
    });
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    context.log('signup: lost a race for the same address, answered the same');
    return ACCEPTED;
  }

  if (outcome === 'taken') {
    context.log('signup: the address already has an account, answered the same');
    return ACCEPTED;
  }

  // The policy moved between the form being rendered and this arriving.
  // Refusing is acceptance criterion 26: a consent to a document nobody saw is
  // not a consent, and this is the one refusal that tells the client to reload
  // rather than to change what the person typed.
  if (outcome !== 'created') return refuse(409, 'policy-moved', { document: outcome.stale });

  await deliver(context, account.email, account.language, secret, input.now);
  return ACCEPTED;
};

/** Sends the confirmation, or records that there is nothing to send it with. */
export async function deliver(
  context: ApiContext,
  email: string,
  language: string,
  secret: string,
  now: number,
): Promise<void> {
  void now;
  if (context.mailer === undefined) {
    context.log('mail: no service is configured, the confirmation was not sent');
    return;
  }

  const delivery = await context.mailer.send(
    confirmationMail({
      to: email,
      locale: language,
      link: confirmationLink({ base: context.site, locale: language, secret }),
      lifetimeMs: CONFIRMATION_LIFETIME_MS,
    }),
  );

  // The address is deliberately absent from the line. A log of who failed to
  // receive mail is a log of who has an account here.
  if (!delivery.ok) {
    context.log(`mail: refused, retryable ${String(delivery.retryable)}, ${delivery.detail}`);
  }
}
