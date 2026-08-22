// Sending mail, behind the narrowest possible interface.
//
// WHICH PROVIDER SENDS IT IS A BUSINESS DECISION THE OWNER HAS NOT MADE YET
// (DirectMail on SCCC for residency, or Resend, or SES; options and prices are
// with him). Nothing else depends on the answer, so the server ships with the
// interface and a null implementation, and the day the choice lands, one file
// implements `Mailer` and one line in `main.ts` swaps it in.
//
// THE INTERFACE TAKES A FINISHED MESSAGE, NOT AN ADDRESS AND A TOKEN. An
// adapter transports; it never composes. That keeps three things out of the
// provider's reach: which language a teacher reads (`message.ts` carries it),
// how a confirmation token becomes a link, and whether the plain text part
// exists at all. Switching provider then changes no word anybody reads.
//
// AND EVERY MESSAGE CARRIES BOTH PARTS. The plain text is not a courtesy: some
// clients refuse HTML outright, and an HTML only message is a well known spam
// signal. `message.ts` builds both from one copy table so they cannot drift.
//
// `send` resolves to nothing, and the caller must not let a rejection reach the
// person: a signup that already wrote an account must not fail because a mail
// queue hiccuped. `routes.ts` is where that is enforced.

import type { Message } from './message';

export type { Message } from './message';

export interface Mailer {
  send(message: Message): Promise<void>;
}

/**
 * The stand-in until the provider is chosen. Sends nothing and says so once
 * per boot, WITHOUT the address or the link: an email address is PII and a
 * confirmation link is a credential, and neither belongs in a log line.
 */
export function nullMailer(log: (line: string) => void): Mailer {
  let warned = false;
  return {
    // The message is deliberately not read: this implementation exists to say
    // nothing was sent, and reading it would only invite logging it.
    send: () => {
      if (!warned) {
        warned = true;
        log('mailer: no provider configured, confirmation emails are NOT being sent');
      }
      return Promise.resolve();
    },
  };
}
