// What this site is allowed to claim, read from the measurement itself.
//
// PLAN.md section 8ب makes our real numbers the competitive position: accuracy
// measured on the golden set, published with its methodology. FAILURE-MODES
// puts the trap next to it in one sentence, that publishing an accuracy without
// its refusal rate is the same lie a product that guesses tells, and closes
// with the line this file exists to honour: otherwise our stated methodology is
// decoration.
//
// So the marketing copy does not carry a number a human typed. It reads
// `golden-report.json`, and while the accuracy gate is DISARMED, which it is
// until thirty real papers exist, the page says that in words instead. A build
// that publishes a percentage before the gate arms fails `test/claims.test.ts`.
//
// This is the whole of the integrity argument for the product: the number on
// the marketing page and the number a build gates on cannot drift apart,
// because there is only one of them.

import { readFileSync } from 'node:fs';
import { z } from 'zod';

/** The gate whose arming decides whether an accuracy may be published at all. */
const ACCURACY_GATE = 'accuracy at or above 99.7 percent of questions';

/**
 * Only the fields this site reads, and validated rather than trusted.
 *
 * The report is produced by another package and could change shape under us. A
 * shape this file cannot parse must not be able to become permission to publish
 * a number, so the schema is narrow and the failure path is "claim nothing".
 */
const ReportSchema = z.object({
  cases: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1),
  gates: z.array(z.object({ gate: z.string(), armed: z.boolean(), passed: z.boolean() })),
});

export interface Evidence {
  /** True once the golden set carries enough real paper to mean anything. */
  readonly armed: boolean;
  readonly papersNeeded: number;
  /** The synthetic sweep's size, which IS publishable because it is what it is. */
  readonly cases: number;
  readonly questions: number;
  /** The published accuracy, and null while it would be a claim about nothing. */
  readonly accuracy: number | null;
}

/** The file as JSON, or null for anything that is not readable JSON. */
function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The report, or a refusal to claim anything.
 *
 * A missing or unreadable report is not treated as permission. It produces the
 * same "not measured yet" state a disarmed gate does, because a build that
 * cannot find its own evidence and a build that has none are the same thing as
 * far as a reader of the page is concerned.
 */
export function readEvidence(path: string, papersNeeded = 30): Evidence {
  const nothing: Evidence = { armed: false, papersNeeded, cases: 0, questions: 0, accuracy: null };

  const result = ReportSchema.safeParse(readJson(path));
  if (!result.success) return nothing;
  const report = result.data;

  const gate = report.gates.find((entry) => entry.gate === ACCURACY_GATE);
  const armed = gate?.armed === true && gate.passed;
  return {
    armed,
    papersNeeded,
    cases: report.cases,
    questions: report.questions,
    // Null, not the synthetic figure. The sweep reads 100 percent on pages it
    // drew itself, and printing that as an accuracy would be the most expensive
    // sentence on the site.
    accuracy: armed ? report.accuracy : null,
  };
}
