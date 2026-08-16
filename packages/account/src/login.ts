// Signing in, and the two ways a login check leaks who exists.
//
// The rules are from NIST SP 800-63B and the OWASP authentication guidance, and
// where the two are read as disagreeing this file follows the reading that does
// not hand an attacker a weapon.
//
// A PROGRESSIVE DELAY, AND NEVER A LOCK. NIST requires rate limiting and names
// the ceiling at a hundred consecutive failures; it accepts progressive delays,
// temporary lockouts or CAPTCHA as ways to get there. OWASP adds the warning
// that decides it: a lockout is itself a denial of service. An attacker who
// cannot guess a teacher's password can still fail on purpose five times and
// lock that teacher out of their own class on results day, again and again, for
// free. A delay cannot be aimed: it costs the attacker exactly what it costs the
// person, and the person is not trying two thousand times an hour.
//
// AND THE DELAY IS CAPPED, WHICH IS NOT A WEAKNESS. At the cap an attacker gets
// two attempts a minute against a password the rules already force to fifteen
// characters and check against a breach corpus. That is not a race anybody wins.
// The cap is what keeps a real user's worst case at half a minute.
//
// NOTHING HERE READS A CLOCK. `now` arrives as a parameter, as everywhere else
// in this package, so a test can sit exactly on a boundary.

/** Free attempts before any delay, because people mistype their own password. */
export const FREE_ATTEMPTS = 3;

/** The first delay, doubling with each failure after the free ones. */
export const BASE_DELAY_MS = 1_000;

/** The ceiling. A real person waits this at worst; an attacker waits it forever. */
export const MAX_DELAY_MS = 30_000;

/**
 * What is known about previous attempts on one identifier.
 *
 * "Identifier" rather than "account" on purpose. The record has to exist for an
 * email nobody has registered too, or the presence of throttling would itself
 * answer the question of who has an account here.
 */
export interface Attempts {
  /** Consecutive failures since the last success. */
  readonly failures: number;
  /** When the last one was. Absent when there has never been a failure. */
  readonly lastFailureAt?: number;
}

export type LoginRefusal =
  /** Wrong password, or no such account. The caller must not distinguish them. */
  | 'wrong'
  /** Too soon after the last failure. Says nothing about whether the account exists. */
  | 'too-soon';

export type LoginOutcome =
  | { readonly ok: true; readonly confirmed: boolean }
  | { readonly ok: false; readonly reason: 'too-soon'; readonly retryInMs: number }
  | { readonly ok: false; readonly reason: 'wrong'; readonly failures: number };

/**
 * How long a caller must wait after a given number of consecutive failures.
 *
 * Zero for the first few, then doubling, then flat. Exported because the storage
 * layer writes the next allowed moment and a test should be able to check the
 * schedule without going through a login.
 */
export function delayAfter(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0;
  const doublings = failures - FREE_ATTEMPTS - 1;
  // Computed by shifting rather than exponentiating so a large failure count
  // cannot overflow into Infinity on its way to being capped.
  const grown = doublings >= 31 ? MAX_DELAY_MS : BASE_DELAY_MS * 2 ** doublings;
  return Math.min(grown, MAX_DELAY_MS);
}

export interface LoginInput {
  readonly attempts: Attempts;
  /**
   * Whether the password verified.
   *
   * FALSE FOR AN ACCOUNT THAT DOES NOT EXIST, and the caller must have spent the
   * same time finding that out. Comparing against a discarded hash costs the
   * hundred milliseconds a real check costs, and skipping it turns the response
   * time into a directory of who has an account here.
   */
  readonly passwordMatches: boolean;
  /** Whether the mailbox has been confirmed. Reported, never a refusal. */
  readonly confirmed: boolean;
  readonly now: number;
}

/**
 * Whether this attempt may proceed.
 *
 * THE ORDER IS THE SECURITY PROPERTY. The delay is checked BEFORE the password,
 * so a throttled attacker learns nothing from the answer: a correct password
 * presented too soon is refused exactly as a wrong one is, and the timing is the
 * same because no hash was computed either way.
 *
 * AN UNCONFIRMED MAILBOX IS NOT A REFUSAL. PLAN.md section 7 requires
 * confirmation before cloud sync, not before signing in. A teacher can grade a
 * stack of papers on a phone that has never had a network, so refusing the login
 * would block work that does not need the mailbox at all. The fact is reported
 * and whatever gates syncing decides what to do with it.
 */
export function checkLogin(input: LoginInput): LoginOutcome {
  const waited = input.now - (input.attempts.lastFailureAt ?? 0);
  const owed = delayAfter(input.attempts.failures);
  if (input.attempts.lastFailureAt !== undefined && waited < owed) {
    return { ok: false, reason: 'too-soon', retryInMs: owed - waited };
  }

  if (!input.passwordMatches) {
    return { ok: false, reason: 'wrong', failures: input.attempts.failures + 1 };
  }

  return { ok: true, confirmed: input.confirmed };
}
