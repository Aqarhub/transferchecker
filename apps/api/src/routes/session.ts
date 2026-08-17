// Signing in, refreshing and signing out.
//
// ONE REFUSAL FOR EVERY WAY A SIGN IN CAN FAIL, and it is not laziness. A wrong
// password and an address with no account are the same 401 with the same body,
// because the pair of them is the leak the whole login path is built around:
// `packages/db` already spends a real Argon2id comparison against a decoy hash
// so the two cost the same time, and reporting them differently here would
// throw that away for the sake of a friendlier error message.
//
// THE SAME GOES FOR A REFRESH. Unknown, expired, revoked and REUSED all answer
// one 401. The last one matters most: a thief presenting a stolen token that has
// already been rotated must learn nothing from the answer, while the server has
// already revoked the whole family by the time the reply is written.
//
// What the reasons are still good for is the log, which is the one place they
// belong, and which never carries an address or a token.

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { asAuth, hashSecret, renew, revokeFamily, schema, signIn } from '@transferchecker/db';
import { RULES } from '../limits';
import { refuse, throttled } from '../context';
import type { ApiContext, Reply, RouteInput } from '../context';
import type { Grant } from '@transferchecker/db';

const SignInBody = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(512),
  /**
   * What the person would recognise this session as, in a sessions screen.
   *
   * Deliberately not a user agent and not an address: data minimisation is the
   * strongest protection the product has, and "Pixel 8a" tells the owner which
   * session to end while telling a leak nothing about where anybody was.
   */
  deviceLabel: z.string().trim().max(64).optional(),
});

const TokenBody = z.object({ refreshToken: z.string().min(1).max(512) });

/** What a client is handed. The ids are inside the token; they are not repeated. */
const granted = (grant: Grant): Reply => ({
  status: 200,
  body: {
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    accessExpiresAt: grant.accessExpiresAt,
    refreshExpiresAt: grant.refreshExpiresAt,
    emailConfirmed: grant.emailConfirmed,
  },
});

export const signin = async (context: ApiContext, input: RouteInput): Promise<Reply> => {
  const limited = throttled(context, RULES.signin, `signin:${input.address}`, input);
  if (limited !== undefined) return limited;

  const body = SignInBody.safeParse(input.body);
  if (!body.success) return refuse(400, 'invalid-request');

  const result = await asAuth(context.db, (tx) =>
    signIn(
      tx,
      {
        email: body.data.email,
        password: body.data.password,
        now: input.now,
        ...(body.data.deviceLabel === undefined ? {} : { deviceLabel: body.data.deviceLabel }),
      },
      context.tokens,
    ),
  );

  if (result.ok) {
    context.log('signin: granted');
    return granted(result.grant);
  }

  // The per account throttle, which is a different defence from the per address
  // one above: that slows somebody guessing one teacher's password, this slows
  // somebody trying one password against every teacher.
  if (result.reason === 'too-soon') {
    context.log('signin: refused, throttled');
    return {
      status: 429,
      body: { error: 'too-many-attempts', retryInMs: result.retryInMs },
      headers: { 'Retry-After': String(Math.ceil(result.retryInMs / 1000)) },
    };
  }

  context.log('signin: refused');
  return refuse(401, 'invalid-credentials');
};

export const refresh = async (context: ApiContext, input: RouteInput): Promise<Reply> => {
  const limited = throttled(context, RULES.refresh, `refresh:${input.address}`, input);
  if (limited !== undefined) return limited;

  const body = TokenBody.safeParse(input.body);
  if (!body.success) return refuse(400, 'invalid-request');

  const result = await asAuth(context.db, (tx) =>
    renew(tx, { presented: body.data.refreshToken, now: input.now }, context.tokens),
  );

  if (result.ok) return granted(result.grant);

  // `reused` is the alarm and it is written down here, because this is the only
  // record that a theft was detected. The client is told nothing extra.
  context.log(`refresh: refused, ${result.reason}`);
  return refuse(401, 'invalid-token');
};

/**
 * Ending a session, and answering the same whether there was one.
 *
 * 204 for a token nobody issued as well. A sign out that reports "no such
 * session" is one more way to ask whether a token is real.
 */
export const signout = async (context: ApiContext, input: RouteInput): Promise<Reply> => {
  const body = TokenBody.safeParse(input.body);
  if (!body.success) return refuse(400, 'invalid-request');

  await asAuth(context.db, async (tx) => {
    const [token] = await tx
      .select({ familyId: schema.refreshTokens.familyId })
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.id, hashSecret(body.data.refreshToken)))
      .limit(1);
    if (token === undefined) return;
    await revokeFamily(tx, token.familyId, input.now, 'signed-out');
  });

  context.log('signout: done');
  return { status: 204, body: undefined };
};
