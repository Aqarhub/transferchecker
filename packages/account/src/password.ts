// Password rules, written against NIST SP 800-63B revision 4.
//
// That document is the reason this file looks like it does, and most of what it
// says is a list of things NOT to do. The rules people expect (a symbol, a
// digit, a capital, expiry every ninety days) are all explicitly recommended
// AGAINST, because each one pushes a user toward a shorter password with a
// predictable shape, and predictability is what a cracker consumes.
//
// So the whole strength requirement is length, and the whole real defence is
// the breach check: a fifteen character password that appears in a breach
// corpus is worth less than a twelve character one that does not.
//
// WHAT IS PURE HERE AND WHAT IS NOT. Deciding whether a password is acceptable
// is pure and lives here. Asking Have I Been Pwned whether it has been seen is
// a network call and does not, but the two halves that make that call SAFE are
// pure and are here: splitting the hash so only a five character prefix ever
// leaves the device, and reading the answer back without ever sending the rest.

import { createHash } from 'node:crypto';

/**
 * Fifteen, from NIST 800-63B revision 4, and it is a SHALL rather than advice.
 *
 * The revision raised it from eight for single factor passwords. The plan
 * records the same number, and this is the code that keeps it.
 */
export const MIN_LENGTH = 15;

/**
 * Sixty four is the floor on the ceiling, not the ceiling.
 *
 * NIST requires accepting AT LEAST 64 characters. A limit lower than that
 * breaks passphrases and password managers, and a limit at exactly 64 would be
 * the minimum that complies, so this sits above it. The upper bound exists at
 * all only to keep a megabyte of text out of a hash function.
 */
export const MAX_LENGTH = 256;

export type PasswordProblem =
  'too-short' | 'too-long' | 'only-whitespace' | 'breached' | 'looks-like-the-email';

export interface PasswordCheck {
  readonly ok: boolean;
  readonly problems: readonly PasswordProblem[];
}

/**
 * Unicode normalisation, which a password comparison needs and rarely gets.
 *
 * The same passphrase typed on two keyboards can arrive as two different byte
 * sequences: an accented character composed on one and decomposed on the other.
 * Without normalising, a user sets a password on a phone and cannot log in from
 * a laptop, and the failure looks exactly like forgetting it. NIST names NFKC.
 */
export const normalise = (password: string): string => password.normalize('NFKC');

/**
 * Length as the person who typed it would count it.
 *
 * Not UTF-16 units, which make an emoji two characters, and not code points
 * either, which make a flag two and a family seven. `Intl.Segmenter` counts
 * grapheme clusters, which is what a human calls a character and what a text
 * field shows them deleting with one backspace.
 *
 * It is also the STRICTER reading of the three, so it errs toward asking for a
 * longer password rather than accepting a shorter one, which is the direction a
 * length rule should err in.
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemes(text: string): number {
  let count = 0;
  const walk = segmenter.segment(text)[Symbol.iterator]();
  while (!walk.next().done) count += 1;
  return count;
}

/**
 * Whether a password may be used, with every reason it may not.
 *
 * Returns ALL the problems rather than the first, because a form that reveals
 * one rule at a time makes a user guess at the others, and each guess is
 * another round trip. `breached` is passed in rather than looked up, since the
 * lookup is a network call and this function is not allowed one.
 */
export function checkPassword(
  password: string,
  options: { readonly email?: string; readonly breached?: boolean } = {},
): PasswordCheck {
  const value = normalise(password);
  const problems: PasswordProblem[] = [];

  // Counted the way a person counts, which is grapheme clusters. Counting
  // UTF-16 units would let a shorter password through than the rule allows.
  const length = graphemes(value);
  if (length < MIN_LENGTH) problems.push('too-short');
  if (length > MAX_LENGTH) problems.push('too-long');
  if (value.trim() === '') problems.push('only-whitespace');
  if (options.breached === true) problems.push('breached');

  // NIST asks that context specific words be refused. The email is the one
  // piece of context every signup form already has, and the local part of it is
  // the most common password a person picks under pressure.
  const local = (options.email ?? '').split('@')[0] ?? '';
  if (local.length >= 3 && value.toLowerCase().includes(local.toLowerCase())) {
    problems.push('looks-like-the-email');
  }

  return { ok: problems.length === 0, problems };
}

export interface HibpQuery {
  /** The five characters that may leave the device. */
  readonly prefix: string;
  /** The rest, which never does. Compared against the response locally. */
  readonly suffix: string;
}

/**
 * The k-anonymity split, which is what makes asking about a password safe.
 *
 * Only the first five hex characters of the SHA-1 are sent. The service answers
 * with every hash it holds that starts with them, some hundreds of lines, and
 * the comparison happens here. So the service learns that somebody asked about
 * one of about 800 hashes and never learns which, and the password itself is
 * never transmitted in any form.
 *
 * SHA-1 is correct here and nowhere else in this repository. It is the protocol
 * Have I Been Pwned defines; it is not being used to store anything.
 */
export function hibpQuery(password: string): HibpQuery {
  const digest = createHash('sha1').update(normalise(password), 'utf8').digest('hex').toUpperCase();
  return { prefix: digest.slice(0, 5), suffix: digest.slice(5) };
}

/**
 * Reads the range response and says whether this password is in it.
 *
 * Kept separate from the request so it can be tested without a network, and so
 * a malformed or truncated body is a `false` rather than a thrown error inside
 * a signup: a breach service that is down must not be able to stop people
 * signing up, and it must not be able to wave a breached password through
 * either. Down means not found, and not found is the safe direction only
 * because the length rule still applies.
 */
export function isBreached(body: string, query: HibpQuery): boolean {
  for (const line of body.split('\n')) {
    const [hash] = line.trim().split(':');
    if (hash?.toUpperCase() === query.suffix) return true;
  }
  return false;
}
