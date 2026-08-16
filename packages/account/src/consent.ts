// The consent record, which is a legal artefact rather than a checkbox.
//
// Every regime this product sells into asks the same thing in different words:
// show that this person agreed, to THIS document, at a knowable moment. GDPR
// article 7 calls it demonstrable, the Saudi PDPL and the UAE decree-law both
// require it to be specific and recorded, and none of them is satisfied by a
// boolean column named `accepted`.
//
// So a consent record names four things and drops none of them: who, which
// document, which version of it, and when. The version is the field people
// leave out, and leaving it out is what makes the whole record worthless the
// first time the policy is edited.

import { z } from 'zod';
import type { Regime } from './countries';

/**
 * A policy version, as a date rather than a number.
 *
 * `2026-08-16` sorts, reads, and answers "which one was live in March" without
 * a lookup table. A counter answers none of those and invites a bump for a typo
 * fix, which then forces re consent from everybody for nothing.
 */
export const PolicyVersionSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'a policy version is the date it took effect');

export const ConsentSchema = z.object({
  /** Who agreed. */
  userId: z.string().min(1),
  /** Which document. Two are separate agreements and are recorded separately. */
  document: z.enum(['privacy', 'terms']),
  /** Which law the document was written against when they agreed. */
  regime: z.string().min(2),
  /** The country they chose, which is what selected the regime. */
  country: z.string().length(2),
  /** The language they read it in, because they consented to what they read. */
  language: z.string().length(2),
  version: PolicyVersionSchema,
  /** Milliseconds since the epoch. Supplied, so nothing here reads a clock. */
  at: z.number().int().nonnegative(),
});

export type Consent = z.infer<typeof ConsentSchema>;

/**
 * Whether a stored consent still covers the document that is live now.
 *
 * Compares the VERSION rather than the presence of a record. A person who
 * agreed to the March policy has not agreed to the August one, and treating an
 * old record as current is the failure that makes a consent log look complete
 * while covering nothing.
 */
export function isCurrent(consent: Consent, liveVersion: string): boolean {
  return consent.version === liveVersion;
}

/**
 * Which documents a person still needs to agree to.
 *
 * Returns the gap rather than a boolean, so a re consent prompt can name the
 * document instead of asking for everything again. Asking again for what was
 * already agreed teaches people to click through, which is the behaviour these
 * rules exist to prevent.
 */
export function outstanding(
  held: readonly Consent[],
  live: { readonly privacy: string; readonly terms: string },
): readonly ('privacy' | 'terms')[] {
  const need: ('privacy' | 'terms')[] = [];
  for (const document of ['privacy', 'terms'] as const) {
    const record = held.find((entry) => entry.document === document);
    if (record === undefined || !isCurrent(record, live[document])) need.push(document);
  }
  return need;
}

/**
 * A consent about to be written, from a signup that was accepted.
 *
 * Built here rather than at the call site so that no caller can construct one
 * with the version left out. The type would allow it; this function does not.
 */
export function consentFor(options: {
  readonly userId: string;
  readonly document: 'privacy' | 'terms';
  readonly regime: Regime;
  readonly country: string;
  readonly language: string;
  readonly version: string;
  readonly at: number;
}): Consent {
  return ConsentSchema.parse(options);
}
