// Sending the confirmation email, behind the narrowest possible interface.
//
// WHICH PROVIDER SENDS IT IS A BUSINESS DECISION THE OWNER HAS NOT MADE YET
// (DirectMail on SCCC for residency, or Resend, or SES; options and prices are
// with him). Nothing else in this round depends on the answer, so the server
// ships with the interface and a null implementation, and the day the choice
// lands, one file implements `Mailer` and one line in `main.ts` swaps it in.
//
// The interface deliberately takes a finished link rather than a token, so no
// implementation ever learns how tokens are built, and it returns void rather
// than a status: a signup must not fail because a mail queue hiccuped, and the
// person can always ask for a resend.

export interface Mailer {
  sendConfirmation(email: string, link: string): Promise<void>;
}

/**
 * The stand-in until the provider is chosen. Sends nothing and says so once
 * per boot, WITHOUT the address or the link: an email address is PII and a
 * confirmation link is a credential, and neither belongs in a log line.
 */
export function nullMailer(log: (line: string) => void): Mailer {
  let warned = false;
  return {
    sendConfirmation: () => {
      if (!warned) {
        warned = true;
        log('mailer: no provider configured, confirmation emails are NOT being sent');
      }
      return Promise.resolve();
    },
  };
}
