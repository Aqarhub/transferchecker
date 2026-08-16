// Confirming a mailbox, at the edges where the friendly answer and the safe one
// are not the same answer.
//
// Two of these tests exist because of things that happen in the world rather
// than in the code: corporate mail gateways open every link in a message before
// a human sees it, and people ask for the mail again before the first one has
// landed. A confirmation flow that is only correct is a confirmation flow that
// tells both of those people their link is broken.

import { describe, expect, it } from 'vitest';
import {
  CONFIRMATION_LIFETIME_MS,
  RESEND_COOLDOWN_MS,
  RESEND_DAILY_CAP,
  RESEND_WINDOW_MS,
  checkConfirmation,
  mayResend,
} from '../src/mailbox';
import type { ConfirmationRecord } from '../src/mailbox';
import { confirmationLink, confirmationMail } from '../src/mail';

const NOW = 1_760_000_000_000;
const USER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

const link = (over: Partial<ConfirmationRecord> = {}): ConfirmationRecord => ({
  id: 'a-hash',
  userId: USER,
  email: 'teacher@school.sa',
  expiresAt: NOW + CONFIRMATION_LIFETIME_MS,
  ...over,
});

describe('an ordinary confirmation', () => {
  it('confirms', () => {
    expect(
      checkConfirmation({ record: link(), currentEmail: 'teacher@school.sa', now: NOW }),
    ).toEqual({ state: 'confirm' });
  });

  it('confirms whatever casing the address was typed in', () => {
    expect(
      checkConfirmation({
        record: link({ email: 'Teacher@School.SA' }),
        currentEmail: 'teacher@school.sa',
        now: NOW,
      }),
    ).toEqual({ state: 'confirm' });
  });

  it('confirms in the last millisecond of the link life', () => {
    const record = link();
    expect(
      checkConfirmation({ record, currentEmail: record.email, now: record.expiresAt - 1 }),
    ).toEqual({ state: 'confirm' });
  });

  it('refuses in the first millisecond after', () => {
    const record = link();
    expect(
      checkConfirmation({ record, currentEmail: record.email, now: record.expiresAt }),
    ).toEqual({ state: 'refuse', reason: 'expired' });
  });
});

describe('the second click, which is the common one', () => {
  // A mail gateway fetched the link, or the person clicked twice, or they opened
  // the mail again a week later to check. All three are the same person, already
  // confirmed, and all three must be told it worked.
  it('tells an already confirmed mailbox that it worked', () => {
    const record = link({ usedAt: NOW });
    expect(
      checkConfirmation({
        record,
        currentEmail: record.email,
        confirmedAt: NOW,
        now: NOW + 60_000,
      }),
    ).toEqual({ state: 'already' });
  });

  // The one that would otherwise be an alarming message for no reason: a link
  // that is both used and long expired, on an account that is fine.
  it('says already rather than expired for a link that did its job', () => {
    const record = link({ usedAt: NOW });
    expect(
      checkConfirmation({
        record,
        currentEmail: record.email,
        confirmedAt: NOW,
        now: NOW + 30 * CONFIRMATION_LIFETIME_MS,
      }),
    ).toEqual({ state: 'already' });
  });

  // A resent mail does not kill the earlier one, so whichever arrives first works.
  it('accepts an older link that was never superseded', () => {
    const older = link({ id: 'first-hash', expiresAt: NOW + 1000 });
    expect(checkConfirmation({ record: older, currentEmail: older.email, now: NOW })).toEqual({
      state: 'confirm',
    });
  });
});

describe('the refusal with a security meaning', () => {
  // Without this, a link sent to the old mailbox proves the new one, which means
  // an address can be marked confirmed by proving control of a different address.
  it('refuses a link for an address the profile no longer carries', () => {
    expect(
      checkConfirmation({
        record: link({ email: 'old@school.sa' }),
        currentEmail: 'new@school.sa',
        now: NOW,
      }),
    ).toEqual({ state: 'refuse', reason: 'address-changed' });
  });

  it('reports the changed address rather than the expiry, when it is both', () => {
    expect(
      checkConfirmation({
        record: link({ email: 'old@school.sa', expiresAt: NOW - 1 }),
        currentEmail: 'new@school.sa',
        now: NOW,
      }),
    ).toEqual({ state: 'refuse', reason: 'address-changed' });
  });

  it('refuses a link nobody issued', () => {
    expect(checkConfirmation({ currentEmail: 'teacher@school.sa', now: NOW })).toEqual({
      state: 'refuse',
      reason: 'unknown-link',
    });
  });

  it('refuses a used link on a mailbox that is somehow not confirmed', () => {
    const record = link({ usedAt: NOW - 1000 });
    expect(checkConfirmation({ record, currentEmail: record.email, now: NOW })).toEqual({
      state: 'refuse',
      reason: 'used-link',
    });
  });
});

describe('asking for the mail again', () => {
  it('allows the first request', () => {
    expect(mayResend({ issuedInWindow: 0, now: NOW })).toEqual({ ok: true });
  });

  it('refuses a second request inside the cooldown, and says how long', () => {
    expect(mayResend({ lastIssuedAt: NOW - 10_000, issuedInWindow: 1, now: NOW })).toEqual({
      ok: false,
      reason: 'too-soon',
      retryInMs: RESEND_COOLDOWN_MS - 10_000,
    });
  });

  it('allows it the moment the cooldown is up', () => {
    expect(
      mayResend({ lastIssuedAt: NOW - RESEND_COOLDOWN_MS, issuedInWindow: 1, now: NOW }),
    ).toEqual({ ok: true });
  });

  // Anybody can type anybody's address into a signup form, so without a ceiling
  // this endpoint sends mail to a stranger, repeatedly, from a domain they trust.
  it('refuses once the window is full, however long ago the last one was', () => {
    const out = mayResend({
      lastIssuedAt: NOW - 2 * RESEND_COOLDOWN_MS,
      oldestIssuedAt: NOW - RESEND_WINDOW_MS / 2,
      issuedInWindow: RESEND_DAILY_CAP,
      now: NOW,
    });
    expect(out).toEqual({ ok: false, reason: 'daily-cap', retryInMs: RESEND_WINDOW_MS / 2 });
  });

  it('opens a slot as the oldest one leaves the window', () => {
    expect(
      mayResend({
        lastIssuedAt: NOW - 2 * RESEND_COOLDOWN_MS,
        oldestIssuedAt: NOW - RESEND_WINDOW_MS,
        issuedInWindow: RESEND_DAILY_CAP,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'daily-cap', retryInMs: 0 });
  });
});

describe('the message itself', () => {
  it('is plain text, carries the link, and says what ignoring it costs', () => {
    const mail = confirmationMail({
      to: 'teacher@school.sa',
      locale: 'ar',
      link: 'https://transferchecker.app/ar/confirm?token=abc',
      lifetimeMs: CONFIRMATION_LIFETIME_MS,
    });
    expect(mail.text).toContain('https://transferchecker.app/ar/confirm?token=abc');
    expect(mail.text).toContain('24 ساعة');
    expect(mail.text).toContain('لن يتغير في حسابك شيء');
    expect(mail.text).not.toContain('<');
  });

  it('counts hours the way Arabic counts them', () => {
    const hours = (ms: number): string =>
      confirmationMail({ to: 'a@b.sa', locale: 'ar', link: 'x', lifetimeMs: ms }).text;
    expect(hours(3600_000)).toContain('ساعة واحدة');
    expect(hours(2 * 3600_000)).toContain('ساعتين');
    expect(hours(6 * 3600_000)).toContain('6 ساعات');
    expect(hours(24 * 3600_000)).toContain('24 ساعة');
  });

  it('falls back to English for a language whose copy is not written yet', () => {
    const mail = confirmationMail({
      to: 'teacher@school.fr',
      locale: 'fr',
      link: 'x',
      lifetimeMs: CONFIRMATION_LIFETIME_MS,
    });
    expect(mail.subject).toBe('Confirm your email for TransferChecker');
  });

  // The rule the whole repository is checked against, and the mail is user
  // facing text like any other. The character is written as an escape because
  // the checker that enforces the rule scans this file too.
  it('uses no em dash in any language', () => {
    for (const locale of ['ar', 'en', 'fr']) {
      const mail = confirmationMail({ to: 'a@b.sa', locale, link: 'x', lifetimeMs: 3600_000 });
      expect(`${mail.subject}${mail.text}`).not.toContain('\u2014');
    }
  });

  it('builds a link under the language the person reads', () => {
    expect(
      confirmationLink({ base: 'https://transferchecker.app/', locale: 'ar', secret: 'a b' }),
    ).toBe('https://transferchecker.app/ar/confirm?token=a%20b');
  });
});
