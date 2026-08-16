// The secrets this server hands out, and the rule that none of them is stored.
//
// Two things in this schema are bearer secrets: a refresh token and the link in
// a confirmation mail. Both are generated here and both are written down only as
// their hash, so a stolen backup of either table is worth nothing. The lookup
// goes one way, and the value that came in the request is hashed and compared.
//
// SHA-256 UNSALTED IS RIGHT HERE AND WOULD BE WRONG FOR A PASSWORD. These are
// 256 bits of randomness we generated a moment ago. There is no dictionary to
// run against them, no user who reused one on another site, and therefore
// nothing for a slow hash to buy. A password is the opposite case in every one
// of those respects, which is why it gets Argon2id and this does not.

import { createHash, randomBytes } from 'node:crypto';

/**
 * Thirty two bytes, which is the number that makes guessing not a strategy.
 *
 * 2^256 possibilities against an online endpoint. The reason to write it down
 * rather than leave it to a call site is that a secret shortened by somebody in
 * a hurry produces no error anywhere and no test fails.
 */
export const SECRET_BYTES = 32;

/** A new bearer secret, base64url so it survives a URL and a mail client. */
export const newSecret = (): string => randomBytes(SECRET_BYTES).toString('base64url');

/** What gets stored. Never the secret itself. */
export const hashSecret = (secret: string): string =>
  createHash('sha256').update(secret, 'utf8').digest('hex');
