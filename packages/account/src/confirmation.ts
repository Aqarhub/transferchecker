// Email confirmation: a stored one time token, and the one rule that is pure.
//
// STORED, NOT A SIGNED LINK, and the choice was researched rather than
// preferred. Every surveyed implementation stores (GoTrue hashes the token
// with the email, Auth0 stores single use tickets), OWASP's account
// management guidance requires a stored hashed high entropy token, and the
// deciding asymmetry is what a leak costs: a leaked signing key forges
// confirmations for every account, a leaked hash column forges none, because
// the lookup only goes one way. Resending needs state anyway, so statelessness
// was never really on offer.
//
// This file holds only what is pure: the lifetime and the freshness rule, with
// the clock injected like everywhere else in this package. The hashing, the
// storage and the idempotent confirm live in the database layer, which is
// where the row is.
//
// TWENTY FOUR HOURS, because this link grants nothing. It never signs anybody
// in and never touches which organisation a token names; the only thing it can
// ever do is prove a mailbox received it, once, idempotently. OWASP's tighter
// 15 to 60 minute window is for password reset tokens, which are
// authentication; a confirmation this inert can afford a day, and a shorter
// window would mostly punish teachers who open their mail in the evening.

export const CONFIRMATION_LIFETIME_MS = 24 * 60 * 60_000;

/** Whether a link sent at `sentAt` may still confirm at `now`. */
export function confirmationFresh(sentAt: number, now: number): boolean {
  return now - sentAt < CONFIRMATION_LIFETIME_MS;
}
