// Rate limiting, and the reason it is an interface rather than a Map.
//
// PLAN section 7 names the number: ten sign in attempts a minute per address.
// That is the edge defence sitting on top of the per account throttle in
// `packages/db`, and the two answer different attacks. The account throttle
// slows somebody guessing one teacher's password; this one slows somebody
// trying one password against ten thousand teachers, which the account throttle
// cannot see at all because each account has had exactly one attempt.
//
// IN PROCESS TODAY AND NOT FOREVER. One server means one counter and this is
// correct. Two servers mean an attacker gets the limit twice, so the counter has
// to move to a store both can see, and PLAN section 9 already names it: Redis.
// The catalogue of the region this deploys to carries Tair, which speaks the
// same protocol, so the swap is this interface implemented once more and
// nothing else in the repository changes.
//
// NOTHING HERE READS A CLOCK. `now` is a parameter, as everywhere in this
// codebase, so a window boundary can be tested at the millisecond.

export interface Allowance {
  readonly ok: boolean;
  /** How long until the next attempt would be allowed. Zero when it is allowed. */
  readonly retryInMs: number;
}

export interface Limiter {
  take: (key: string, limit: number, windowMs: number, now: number) => Allowance;
}

interface Window {
  count: number;
  /** When this window opened. It closes `windowMs` later. */
  opened: number;
}

/**
 * A fixed window counter, which is the right shape for this and not for billing.
 *
 * Its known flaw is the boundary: an attacker who spends the whole limit at the
 * end of one window and the whole limit at the start of the next gets double the
 * rate for one instant. A sliding window would not. It is accepted here because
 * the limit exists to make bulk guessing slow rather than to meter anything, and
 * doubling ten attempts for one second changes nothing about that, while a
 * sliding window costs a list of timestamps per address.
 */
export function memoryLimiter(): Limiter {
  const windows = new Map<string, Window>();

  return {
    take(key, limit, windowMs, now) {
      const found = windows.get(key);
      if (found === undefined || now - found.opened >= windowMs) {
        windows.set(key, { count: 1, opened: now });
        // Housekeeping is done here rather than on a timer, so the map cannot
        // grow without bound and nothing has to be shut down cleanly.
        if (windows.size > 10_000) {
          for (const [name, window] of windows) {
            if (now - window.opened >= windowMs) windows.delete(name);
          }
        }
        return { ok: true, retryInMs: 0 };
      }

      if (found.count >= limit) {
        return { ok: false, retryInMs: found.opened + windowMs - now };
      }

      found.count += 1;
      return { ok: true, retryInMs: 0 };
    },
  };
}

export interface Rule {
  readonly limit: number;
  readonly windowMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * A rule per route, and each number has a reason rather than a feel.
 *
 * `signin` is ten a minute, which is the plan's own number.
 *
 * `signup` is twenty an hour, and the number is generous on purpose: a whole
 * staff room signing up on the same school connection shares one address, and a
 * limit that locks out the fifth teacher at a training day is a limit that made
 * the product look broken to twenty people at once.
 *
 * `resend` is the one that protects somebody who is not our user at all.
 * Anybody can type any address into a form, so without a ceiling this endpoint
 * is a way to send mail to a stranger from a domain they trust. The per account
 * ceiling in `packages/db` is the other half, and neither replaces the other:
 * that one counts per mailbox, this one counts per sender.
 */
export const RULES = {
  signin: { limit: 10, windowMs: MINUTE },
  signup: { limit: 20, windowMs: HOUR },
  resend: { limit: 10, windowMs: HOUR },
  confirm: { limit: 20, windowMs: MINUTE },
  refresh: { limit: 60, windowMs: MINUTE },
} as const satisfies Readonly<Record<string, Rule>>;
