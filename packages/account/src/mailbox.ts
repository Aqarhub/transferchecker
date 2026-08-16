// Confirming a mailbox, and the four ways a confirmation link goes wrong.
//
// PLAN section 7: confirmation is required before cloud sync, and not before
// signing in. So nothing here can refuse a login. What it decides is whether one
// link, presented now, may mark one mailbox as proven.
//
// A LINK IS NOT SUPERSEDED BY A LATER ONE, AND THAT IS A DECISION. The obvious
// rule is that issuing a new link kills the previous ones, and for a password
// reset it is the right rule: each live link is a key to an account. A
// confirmation link is not that. All it can do is prove control of a mailbox to
// somebody who already controls the mailbox, so the harm of a second live link
// is close to nothing, while the harm of the tidy rule is real: a person who
// asks twice because the first mail was slow, then clicks the first one when it
// finally lands, is told their link is invalid. Every live link stays valid
// until it expires or the mailbox is confirmed, whichever comes first.
//
// AND MAIL SCANNERS FETCH LINKS. Corporate mail gateways open every URL in a
// message before a human sees it, so a single use link consumed by a GET is
// consumed by a machine. Two things answer that, and both belong to whoever
// builds the endpoint: the link lands on a page whose button POSTs, and a link
// that was already redeemed reads as `already` rather than as an error, so the
// person who clicks second is told the truth instead of being alarmed.
//
// NOTHING HERE READS A CLOCK. `now` is a parameter, as everywhere in this package.

/** Twenty four hours: long enough to sign up at night and read mail in the morning. */
export const CONFIRMATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** The shortest gap between two mails to one person. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/** And the ceiling per window, because our mailbox is somebody else's inbox. */
export const RESEND_DAILY_CAP = 5;

/** The window the cap counts over. Rolling, not a calendar day. */
export const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;

/** One issued link, as it is stored. The link itself is never stored. */
export interface ConfirmationRecord {
  /** The hash of the secret in the link. This layer does not care which hash. */
  readonly id: string;
  readonly userId: string;
  /**
   * The address the mail was actually sent to.
   *
   * KEPT BECAUSE THE ADDRESS CAN CHANGE AFTER THE MAIL IS SENT. Without this, a
   * link sent to the old mailbox would confirm the new one, which is to say a
   * person could have any address marked as proven by proving a different one.
   */
  readonly email: string;
  readonly expiresAt: number;
  /** Set when this link was redeemed. */
  readonly usedAt?: number;
}

export type ConfirmRefusal =
  /** No such link. Also what a link whose row was purged looks like, deliberately. */
  | 'unknown-link'
  /** The profile carries a different address now, so this link proves nothing about it. */
  | 'address-changed'
  /** Redeemed already, and yet the mailbox is not confirmed. Only reachable through repair. */
  | 'used-link'
  | 'expired';

export type ConfirmOutcome =
  /** Mark the mailbox confirmed and the link used, in one transaction. */
  | { readonly state: 'confirm' }
  /** Nothing to do, and the person should be told it worked. */
  | { readonly state: 'already' }
  | { readonly state: 'refuse'; readonly reason: ConfirmRefusal };

export interface ConfirmInput {
  /** Absent when nothing matched the presented link. */
  readonly record?: ConfirmationRecord;
  /** The address on the profile right now. */
  readonly currentEmail: string;
  /** When the mailbox was confirmed, if it already was. */
  readonly confirmedAt?: number;
  readonly now: number;
}

/** One mailbox whatever the casing, the same rule the login throttle uses. */
const sameMailbox = (left: string, right: string): boolean =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

/**
 * What to do with a presented link.
 *
 * THE ORDER IS THE ANSWER PEOPLE GET. `already` is decided before expiry,
 * because telling somebody whose mailbox is confirmed that their link expired is
 * a false alarm and a support ticket for nothing. `address-changed` is decided
 * before expiry for the same reason in the other direction: it is the one
 * refusal here with a security meaning, and reporting it as a stale link would
 * hide the fact that the link was for a mailbox this account no longer claims.
 */
export function checkConfirmation(input: ConfirmInput): ConfirmOutcome {
  const record = input.record;
  if (record === undefined) return { state: 'refuse', reason: 'unknown-link' };

  if (input.confirmedAt !== undefined) return { state: 'already' };

  if (!sameMailbox(record.email, input.currentEmail)) {
    return { state: 'refuse', reason: 'address-changed' };
  }

  if (record.usedAt !== undefined) return { state: 'refuse', reason: 'used-link' };

  if (input.now >= record.expiresAt) return { state: 'refuse', reason: 'expired' };

  return { state: 'confirm' };
}

export interface ResendInput {
  /** When the most recent link for this person was issued. */
  readonly lastIssuedAt?: number;
  /** And the oldest one still inside the window, which is when a slot next opens. */
  readonly oldestIssuedAt?: number;
  /** How many were issued inside the window, the one just asked for not counted. */
  readonly issuedInWindow: number;
  readonly now: number;
}

export type ResendOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'too-soon' | 'daily-cap';
      /** How long until asking again would be allowed. */
      readonly retryInMs: number;
    };

/**
 * Whether another confirmation mail may be sent.
 *
 * THE PERSON IS NOT TOLD THE ANSWER, and that is not a detail. Both the request
 * and the refusal are shaped so the endpoint can answer every caller with the
 * same sentence, whether or not the address has an account and whether or not a
 * mail was actually sent. An endpoint that says "sent" for one address and
 * "already sent recently" for another is a directory of who has an account here,
 * which is the same leak the login path is written around.
 *
 * AND THE CAP PROTECTS SOMEBODY ELSE'S INBOX. Anybody can type any address into
 * a signup form, so without a ceiling this endpoint is a way to send mail to a
 * stranger, repeatedly, from a domain they will believe.
 */
export function mayResend(input: ResendInput): ResendOutcome {
  if (input.lastIssuedAt !== undefined) {
    const waited = input.now - input.lastIssuedAt;
    if (waited < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: 'too-soon', retryInMs: RESEND_COOLDOWN_MS - waited };
    }
  }

  if (input.issuedInWindow >= RESEND_DAILY_CAP) {
    // The window rolls, so the next slot opens when the oldest mail inside it
    // falls out. With no oldest to hand, the honest answer is the whole window.
    const oldest = input.oldestIssuedAt ?? input.now;
    return {
      ok: false,
      reason: 'daily-cap',
      retryInMs: Math.max(0, oldest + RESEND_WINDOW_MS - input.now),
    };
  }

  return { ok: true };
}
