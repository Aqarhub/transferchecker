// Signing up, and the four things that have to be true before an account exists.
//
// The country is the one that is easy to treat as a preference and is not. It
// decides which privacy law we are operating under for this person, which
// policy document they are agreeing to, and where their data may be processed.
// PLAN section 8ج settles it: chosen explicitly at signup, never guessed from
// an IP address, because an IP guess is wrong for anyone on a VPN and anyone
// travelling, and it is deciding a LAW rather than a language.
//
// Everything here is pure. It returns what is wrong rather than throwing,
// because a signup form needs to show all four problems at once and a thrown
// error can only carry the first.

import { z } from 'zod';
import { COUNTRIES, regimeOf } from './countries';
import type { Regime } from './countries';
import { checkPassword } from './password';
import type { PasswordProblem } from './password';

/**
 * The email shape, kept deliberately loose.
 *
 * A regex cannot decide whether an address exists, and every strict one ever
 * written rejects somebody's real address. The confirmation mail is the real
 * validator; this only catches a typed mistake before it costs a round trip.
 */
export const EmailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .refine((value) => /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value), 'not an email address');

export const SignupSchema = z.object({
  email: EmailSchema,
  password: z.string(),
  /** ISO 3166-1 alpha-2, and it must be one we offer. */
  country: z.string().length(2),
  /** A language we actually publish, so the policy can be read in it. */
  language: z.string().length(2),
  /**
   * The exact policy version the person saw.
   *
   * Not a boolean. A record that says "agreed" without saying to WHAT is
   * worthless the day the policy changes, and every regime this product sells
   * into requires demonstrable consent rather than asserted consent.
   */
  policyVersion: z.string().min(1),
});

export type SignupRequest = z.infer<typeof SignupSchema>;

export type SignupProblem =
  | { readonly field: 'email'; readonly why: 'missing' | 'malformed' }
  | { readonly field: 'password'; readonly why: PasswordProblem }
  | { readonly field: 'country'; readonly why: 'missing' | 'not-offered' }
  | { readonly field: 'language'; readonly why: 'missing' | 'not-published' }
  | { readonly field: 'policyVersion'; readonly why: 'missing' | 'stale' };

export interface Accepted {
  readonly email: string;
  readonly country: string;
  readonly language: string;
  /** Derived, never supplied by the client. Which law this account sits under. */
  readonly regime: Regime;
  readonly policyVersion: string;
}

export type SignupResult =
  | { readonly ok: true; readonly account: Accepted }
  | { readonly ok: false; readonly problems: readonly SignupProblem[] };

export interface SignupContext {
  /** The languages this build publishes. A policy has to be readable. */
  readonly languages: readonly string[];
  /** The policy version currently live for this country's regime. */
  readonly currentPolicyVersion: (regime: Regime) => string;
  /** Whether the password appeared in a breach corpus. Looked up by the caller. */
  readonly breached?: boolean;
}

/**
 * Validates a signup and returns the account that would be created.
 *
 * It does not create anything and it does not hash anything: hashing belongs to
 * the auth provider, and the plan names bcrypt through Supabase today and
 * Argon2id if that is ever self hosted. What this owns is the decision, so the
 * decision can be tested without a database.
 */
export function checkSignup(input: unknown, context: SignupContext): SignupResult {
  const parsed = SignupSchema.safeParse(input);
  if (!parsed.success) {
    // A shape failure is reported per field so the form can mark them, rather
    // than as one message that makes the person hunt.
    const problems: SignupProblem[] = [];
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'email') problems.push({ field: 'email', why: 'malformed' });
      else if (field === 'country') problems.push({ field: 'country', why: 'missing' });
      else if (field === 'language') problems.push({ field: 'language', why: 'missing' });
      else if (field === 'policyVersion') problems.push({ field: 'policyVersion', why: 'missing' });
    }
    return {
      ok: false,
      problems: problems.length > 0 ? problems : [{ field: 'email', why: 'missing' }],
    };
  }

  const request = parsed.data;
  const problems: SignupProblem[] = [];
  const country = request.country.toUpperCase();
  const language = request.language.toLowerCase();

  // The country the person picked has to be one we offer. A country we withheld
  // must fail here rather than fall through to a default policy, which would be
  // selling into a market the owner decided not to sell into.
  if (!COUNTRIES.includes(country)) problems.push({ field: 'country', why: 'not-offered' });
  if (!context.languages.includes(language)) {
    problems.push({ field: 'language', why: 'not-published' });
  }

  for (const why of checkPassword(request.password, {
    email: request.email,
    ...(context.breached === undefined ? {} : { breached: context.breached }),
  }).problems) {
    problems.push({ field: 'password', why });
  }

  const regime = regimeOf(country);
  // Consent has to be to the version that is live now. Agreeing to a policy we
  // have since replaced is a record of agreement to a document nobody is
  // operating under, which is the same as no record.
  if (request.policyVersion !== context.currentPolicyVersion(regime)) {
    problems.push({ field: 'policyVersion', why: 'stale' });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    account: {
      email: request.email.toLowerCase(),
      country,
      language,
      regime,
      policyVersion: request.policyVersion,
    },
  };
}
