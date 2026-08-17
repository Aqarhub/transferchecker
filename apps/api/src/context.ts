// Everything a route needs, handed in rather than imported.
//
// The clock, the mailer, the database and the rate limiter all arrive here, so
// a test can pin the moment, record the mail and boot a real PostgreSQL inside
// the process, and the routes have no idea any of that happened. It is the same
// rule `packages/account` follows for `now`, applied to a server.

import type { Mailer, TokenSetup } from '@transferchecker/account';
import type { Database } from '@transferchecker/db';
import type { Limiter } from './limits';

export interface PolicyVersions {
  readonly privacy: string;
  readonly terms: string;
}

/**
 * The versions the policy pages carry right now.
 *
 * MOVING A POLICY PAGE MEANS MOVING THIS LINE IN THE SAME COMMIT. A signup is
 * refused when the version the form showed is not the live one, which is
 * acceptance criterion 26 and the only thing that makes a consent record
 * evidence of anything. If the page moves and this does not, every signup is
 * refused; if this moves and the page does not, every consent on file names a
 * document nobody saw.
 */
export const LIVE_POLICY: PolicyVersions = { privacy: '2026-08-01', terms: '2026-08-01' };

export interface ApiContext {
  readonly db: Database;
  readonly tokens: TokenSetup;
  /**
   * Absent until the owner chooses a sending service.
   *
   * The server runs without one and says so at startup. Confirmation gates
   * cloud sync and never the sign in, so an account made today works on a phone
   * today and waits for its mailbox to be proved before anything leaves it.
   */
  readonly mailer?: Mailer;
  readonly limiter: Limiter;
  readonly now: () => number;
  /** Where a confirmation link points, without a trailing slash. */
  readonly site: string;
  /** The languages a policy can be read in. A person may not consent blind. */
  readonly languages: readonly string[];
  readonly policy: PolicyVersions;
  /**
   * How many proxies of ours a request really passes through.
   *
   * Zero unless a load balancer is in front. See `clientAddress`: this decides
   * whether an attacker can pick their own address out of a header.
   */
  readonly proxyHops: number;
  /**
   * Where a line about a request goes.
   *
   * NO ADDRESS AND NO TOKEN EVER REACHES IT, which PLAN section 7 requires in
   * one line and which is easiest to break here of anywhere in the product.
   * What is logged is a route, an outcome and a reason.
   */
  readonly log: (line: string) => void;
}

/**
 * The version a signup form must have shown.
 *
 * The regime is taken and not read, because one policy version covers every
 * regime today. The day a market needs its own document, this is where the two
 * stop being the same string, and the signature already says so.
 */
export const versionFor = (policy: PolicyVersions) => (): string => policy.privacy;

export interface Reply {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface RouteInput {
  /** The parsed body. `undefined` when it was absent or not JSON. */
  readonly body: unknown;
  /** The address the rate limiter counts. Already resolved through any proxy. */
  readonly address: string;
  readonly now: number;
  /** The `Authorization` header, verbatim. Verified in `bearer.ts` and nowhere else. */
  readonly authorization?: string;
  /** The query string, for the routes that take a cursor. */
  readonly query?: URLSearchParams;
}

export type Route = (context: ApiContext, input: RouteInput) => Promise<Reply>;

/** One refusal shape for the whole server, so a client parses one thing. */
export const refuse = (status: number, error: string, extra: object = {}): Reply => ({
  status,
  body: { error, ...extra },
});

/**
 * The rate limit, applied before anything else a route does.
 *
 * Before the body is even looked at, which is the point: a route that parses
 * first and counts second has already done work for an attacker who is being
 * refused anyway.
 */
export function throttled(
  context: ApiContext,
  rule: { readonly limit: number; readonly windowMs: number },
  key: string,
  input: RouteInput,
): Reply | undefined {
  const allowance = context.limiter.take(key, rule.limit, rule.windowMs, input.now);
  if (allowance.ok) return undefined;
  return {
    status: 429,
    body: { error: 'too-many-requests', retryInMs: allowance.retryInMs },
    headers: { 'Retry-After': String(Math.ceil(allowance.retryInMs / 1000)) },
  };
}
