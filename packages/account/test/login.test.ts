import { describe, expect, it } from 'vitest';
import { BASE_DELAY_MS, FREE_ATTEMPTS, MAX_DELAY_MS, checkLogin, delayAfter } from '../src/login';

const T0 = Date.UTC(2026, 7, 16, 12, 0, 0);
const attempt = (over: Partial<Parameters<typeof checkLogin>[0]> = {}) =>
  checkLogin({
    attempts: { failures: 0 },
    passwordMatches: true,
    confirmed: true,
    now: T0,
    ...over,
  });

describe('the delay schedule', () => {
  it('costs nothing for the first few, because people mistype their own password', () => {
    for (let failures = 0; failures <= FREE_ATTEMPTS; failures += 1) {
      expect(delayAfter(failures)).toBe(0);
    }
  });

  it('doubles after that', () => {
    expect(delayAfter(FREE_ATTEMPTS + 1)).toBe(BASE_DELAY_MS);
    expect(delayAfter(FREE_ATTEMPTS + 2)).toBe(BASE_DELAY_MS * 2);
    expect(delayAfter(FREE_ATTEMPTS + 3)).toBe(BASE_DELAY_MS * 4);
  });

  // The cap is what keeps a real person's worst case at half a minute, and it
  // still leaves an attacker at two attempts a minute against a fifteen
  // character password. That is not a race anybody wins.
  it('stops growing, and never overflows however many failures are counted', () => {
    expect(delayAfter(100)).toBe(MAX_DELAY_MS);
    expect(delayAfter(1_000_000)).toBe(MAX_DELAY_MS);
    expect(Number.isFinite(delayAfter(Number.MAX_SAFE_INTEGER))).toBe(true);
  });
});

describe('signing in', () => {
  it('lets a correct password through', () => {
    expect(attempt()).toEqual({ ok: true, confirmed: true });
  });

  it('refuses a wrong one and counts it', () => {
    expect(attempt({ passwordMatches: false })).toEqual({
      ok: false,
      reason: 'wrong',
      failures: 1,
    });
  });

  it('has no opinion about an unconfirmed mailbox beyond reporting it', () => {
    // PLAN section 7 requires confirmation before cloud sync, not before signing
    // in. A teacher grades on a phone that has never had a network.
    expect(attempt({ confirmed: false })).toEqual({ ok: true, confirmed: false });
  });
});

describe('the throttle', () => {
  it('refuses while the delay is still owed', () => {
    const outcome = attempt({
      attempts: { failures: FREE_ATTEMPTS + 1, lastFailureAt: T0 - 400 },
    });
    expect(outcome).toEqual({ ok: false, reason: 'too-soon', retryInMs: BASE_DELAY_MS - 400 });
  });

  it('lets the attempt through the moment the delay has passed', () => {
    const outcome = attempt({
      attempts: { failures: FREE_ATTEMPTS + 1, lastFailureAt: T0 - BASE_DELAY_MS },
    });
    expect(outcome).toEqual({ ok: true, confirmed: true });
  });

  // THE ORDER IS THE SECURITY PROPERTY. A correct password presented too soon is
  // refused exactly as a wrong one is, so a throttled attacker learns nothing
  // from which answer came back.
  it('answers a correct password the same as a wrong one while throttled', () => {
    const attempts = { failures: FREE_ATTEMPTS + 2, lastFailureAt: T0 - 10 };
    const right = attempt({ attempts, passwordMatches: true });
    const wrong = attempt({ attempts, passwordMatches: false });
    expect(right).toEqual(wrong);
    expect(right).toMatchObject({ ok: false, reason: 'too-soon' });
  });

  it('throttles an identifier that has never had an account, identically', () => {
    // The record exists for an unregistered email too, or the presence of
    // throttling would answer the question of who has an account here.
    const unknown = attempt({
      attempts: { failures: FREE_ATTEMPTS + 1, lastFailureAt: T0 - 100 },
      passwordMatches: false,
    });
    const known = attempt({
      attempts: { failures: FREE_ATTEMPTS + 1, lastFailureAt: T0 - 100 },
      passwordMatches: true,
    });
    expect(unknown).toEqual(known);
  });

  it('never refuses a first attempt, however long ago anything happened', () => {
    expect(attempt({ attempts: { failures: 0 } })).toMatchObject({ ok: true });
  });

  // A lock would let an attacker deny a real teacher their own account on
  // results day. This is the property that says we did not build one.
  it('always lets an attempt through eventually, whatever the failure count', () => {
    const outcome = attempt({
      attempts: { failures: 10_000, lastFailureAt: T0 - MAX_DELAY_MS },
    });
    expect(outcome).toMatchObject({ ok: true });
  });
});
