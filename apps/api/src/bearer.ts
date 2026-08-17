// Who is calling, from the token they presented.
//
// THIS IS WHERE THE SIGNED TOKEN BECOMES A DATABASE SESSION, and the whole
// isolation model rests on the two lines doing it in the right order: the
// signature is verified first, by `packages/account`, and only the claims that
// survived that are handed to `asTenant`. Nothing between here and the policy
// reads the request again.
//
// AND THE MAILBOX GATE LIVES HERE, because PLAN section 7 puts it before cloud
// sync and nowhere else. A teacher signs in and grades a stack of papers on a
// phone that has never had a network; what waits for a proved mailbox is the
// moment anything leaves the device.

import { checkAccessToken } from '@transferchecker/account';
import type { AccessClaims } from '@transferchecker/account';
import type { ApiContext, Reply, RouteInput } from './context';
import { refuse } from './context';

export type Caller =
  | { readonly ok: true; readonly claims: AccessClaims }
  | { readonly ok: false; readonly reply: Reply };

/**
 * The claims of a verified token, or the refusal to send back.
 *
 * `WWW-Authenticate` is set because this is a bearer scheme and a client that
 * cannot tell "no token" from "bad token" retries the wrong one forever. The
 * reason inside it is deliberately coarse: `invalid_token` covers expired,
 * forged, and signed by a key we retired, and the difference is for our log.
 */
export function caller(context: ApiContext, input: RouteInput, needsMailbox: boolean): Caller {
  const header = input.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || token === undefined || token === '') {
    return {
      ok: false,
      reply: {
        ...refuse(401, 'no-token'),
        headers: { 'WWW-Authenticate': 'Bearer' },
      },
    };
  }

  const checked = checkAccessToken({
    token,
    keys: context.tokens.keyring.verifying,
    now: input.now,
    names: context.tokens.names,
  });

  if (!checked.ok) {
    context.log(`bearer: refused, ${checked.reason}`);
    return {
      ok: false,
      reply: {
        ...refuse(401, 'invalid-token'),
        headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
      },
    };
  }

  // 403 rather than 401, and the difference matters to the client: the token is
  // valid and the account is fine, and refreshing it will not help until the
  // person has opened the mail. The client's remedy is to say so on screen.
  if (needsMailbox && !checked.claims.emailConfirmed) {
    context.log('bearer: refused, mailbox not confirmed');
    return { ok: false, reply: refuse(403, 'mailbox-unconfirmed') };
  }

  return { ok: true, claims: checked.claims };
}
