// The confirmation message, and the seam a sending service plugs into.
//
// WHICH SERVICE SENDS IT IS NOT A TECHNICAL DECISION and is not made here. It is
// a price with a name on it, and it belongs to the product owner. What is built
// here is everything that does not depend on the answer: the message, the link,
// and one interface with a single method. Whichever service is chosen, it is one
// file implementing `Mailer`, and nothing else in the repository changes.
//
// PLAIN TEXT, NO HTML, AND THAT IS A CHOICE. An HTML mail with a remote image is
// a read receipt we did not ask anybody for, which contradicts the product's
// own privacy claim in the one message every single user is guaranteed to
// receive. Plain text also carries no tracking pixel to strip, renders in every
// client, and is the shape least likely to be scored as bulk mail.
//
// TWO LANGUAGES ARE WRITTEN HERE AND SIX ARE NOT. Arabic and English, the two
// the owner writes. The other six published languages go through a researched
// rewrite and a second reader before they ship, which is the process that caught
// real errors in the marketing copy, and inventing six mail bodies outside it
// would put unreviewed text in front of exactly the people that process exists
// to protect. They fall back to English and are listed as a launch item.

import type { ConfirmationRecord } from './mailbox';

export interface Mail {
  readonly to: string;
  readonly subject: string;
  /** Plain text. There is no HTML part and there is not meant to be one. */
  readonly text: string;
}

export type Delivery =
  | { readonly ok: true; readonly id?: string }
  | {
      readonly ok: false;
      /**
       * Whether trying again could work.
       *
       * The one distinction worth carrying across the seam. A refused address is
       * final and a queue that retries it forever is a queue that never drains;
       * a rate limit or a gateway timeout is temporary and giving up on it loses
       * a signup that was going to succeed.
       */
      readonly retryable: boolean;
      readonly detail: string;
    };

export interface Mailer {
  send: (mail: Mail) => Promise<Delivery>;
}

/**
 * Where a confirmation link points.
 *
 * THREE REQUIREMENTS FOR WHOEVER SERVES THIS PATH, and they are not optional.
 * The page must send `Referrer-Policy: no-referrer`, or the secret in the query
 * leaves in a header the moment the page loads anything. It must load nothing
 * from a third party for the same reason. And the button on it must POST, so a
 * mail gateway that fetches every link in a message cannot redeem it before the
 * person reads it.
 */
export function confirmationLink(input: {
  readonly base: string;
  readonly locale: string;
  readonly secret: string;
}): string {
  const base = input.base.replace(/\/+$/, '');
  return `${base}/${input.locale}/confirm?token=${encodeURIComponent(input.secret)}`;
}

const PRODUCT = 'TransferChecker';

/**
 * Hours as the language actually counts them.
 *
 * Arabic does not put a plural after a number the way English does: one takes a
 * word, two has its own form, three to ten take the plural, and above that the
 * singular returns. Writing `24 ساعات` would be a mistake a reader notices in
 * the first mail we ever send them.
 */
function arabicHours(hours: number): string {
  if (hours === 1) return 'ساعة واحدة';
  if (hours === 2) return 'ساعتين';
  if (hours >= 3 && hours <= 10) return `${String(hours)} ساعات`;
  return `${String(hours)} ساعة`;
}

const englishHours = (hours: number): string =>
  hours === 1 ? 'one hour' : `${String(hours)} hours`;

export interface ConfirmationMail {
  readonly to: string;
  readonly locale: string;
  readonly link: string;
  /** How long the link lives. Taken from the record so the two cannot disagree. */
  readonly lifetimeMs: number;
}

/**
 * The message, in the reader's language where we have one written.
 *
 * The last line matters more than it looks. Somebody who did not sign up has to
 * be told that ignoring this costs them nothing, because the alternative is that
 * they go looking for an account to delete that was never created in their name.
 */
export function confirmationMail(input: ConfirmationMail): Mail {
  const hours = Math.max(1, Math.round(input.lifetimeMs / (60 * 60 * 1000)));

  if (input.locale === 'ar') {
    return {
      to: input.to,
      subject: `أكّد بريدك في ${PRODUCT}`,
      text: [
        'مرحباً،',
        '',
        'افتح هذا الرابط لتأكيد بريدك:',
        input.link,
        '',
        `ينتهي الرابط بعد ${arabicHours(hours)}، ويُستعمل مرة واحدة.`,
        '',
        'وإن لم تطلب هذا فلا تفعل شيئاً، ولن يتغير في حسابك شيء.',
        '',
        PRODUCT,
        '',
      ].join('\n'),
    };
  }

  return {
    to: input.to,
    subject: `Confirm your email for ${PRODUCT}`,
    text: [
      'Hello,',
      '',
      'Open this link to confirm your email address:',
      input.link,
      '',
      `The link expires in ${englishHours(hours)} and can be used once.`,
      '',
      'If you did not ask for this, do nothing. Nothing about your account changes.',
      '',
      PRODUCT,
      '',
    ].join('\n'),
  };
}

/** The message for one issued record, so the expiry in the text is the real one. */
export function mailFor(
  record: ConfirmationRecord,
  input: { readonly locale: string; readonly link: string; readonly issuedAt: number },
): Mail {
  return confirmationMail({
    to: record.email,
    locale: input.locale,
    link: input.link,
    lifetimeMs: record.expiresAt - input.issuedAt,
  });
}
