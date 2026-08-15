// Aggregating the sweep, and the gates that read the aggregate.
//
// Five gates, and only some of them can be armed today. That distinction is
// carried in the report itself rather than in a comment somewhere, because the
// number this project publishes about its own accuracy is a marketing claim in
// PLAN.md section 8ب, and a synthetic sweep that reports "100 percent" without
// saying what it measured would be the most expensive lie in the repository.

import type { CaseRecord } from './score';
import type { Verdict } from './truth';

export interface StratumSummary {
  readonly stratum: string;
  readonly cases: number;
  /** Cases that ended the way the case demanded, graded or refused. */
  readonly asked: number;
  readonly questions: number;
  readonly counts: Readonly<Record<Verdict, number>>;
  /** Correct over decided questions, where a flag counts against us. */
  readonly accuracy: number;
}

export interface GateResult {
  readonly gate: string;
  readonly armed: boolean;
  readonly passed: boolean;
  readonly detail: string;
}

export interface GoldenReport {
  readonly tier: 'synthetic';
  readonly cases: number;
  readonly questions: number;
  /**
   * Questions where the paper actually carried an answer, and how many of those
   * came back with the right letter.
   *
   * This is the honest denominator and the headline accuracy is not. [measured]
   * Of 660 quick tier questions, 428 expect blank and 229 expect an answer, so
   * an engine that answers NOTHING scores 64.85 percent, and the denominator is
   * contributor controlled: adding blank pages raises it for free.
   */
  readonly answerable: number;
  readonly answeredCorrect: number;
  readonly answeredAccuracy: number;
  readonly counts: Readonly<Record<Verdict, number>>;
  readonly accuracy: number;
  readonly flagRate: number;
  readonly wrongSheets: readonly string[];
  readonly strata: readonly StratumSummary[];
  /** First percentile of the decision margin over every decided question. */
  readonly marginP1: number;
  readonly gates: readonly GateResult[];
  readonly elapsedMs: number;
  /** Said in the artifact, not only in a document. */
  readonly caveat: string;
}

const ZERO: Record<Verdict, number> = { correct: 0, flagged: 0, missed: 0, wrong: 0 };

const VERDICTS: readonly Verdict[] = ['correct', 'flagged', 'missed', 'wrong'];

const add = (into: Record<Verdict, number>, from: Readonly<Record<Verdict, number>>): void => {
  for (const key of VERDICTS) into[key] += from[key];
};

const total = (counts: Readonly<Record<Verdict, number>>): number =>
  counts.correct + counts.flagged + counts.missed + counts.wrong;

const rate = (part: number, whole: number): number => (whole === 0 ? 1 : part / whole);

/**
 * The first percentile of the margin, which is the leading indicator.
 *
 * A sheet whose margins are wide gives the same answer under any small
 * disturbance, so the margin distribution moves BEFORE the accuracy does. It is
 * the number that fails in this repository rather than in a classroom.
 */
function firstPercentile(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.01));
  return sorted[index] ?? 0;
}

/** How many real papers the accuracy gates wait for before they arm themselves. */
export const PAPERS_TO_ARM = 30;

/**
 * The floor under the share of ANSWERED questions that come back right.
 *
 * [measured] The working engine reads 100 percent of them on this corpus, so
 * the floor is a ratchet with room rather than a target to tune toward. It is
 * not the published accuracy claim and the report says so: this counts only
 * questions the corpus answered, on pages the corpus drew.
 */
const MIN_ANSWERED_ACCURACY = 0.98;

export function summarise(records: readonly CaseRecord[], realPapers = 0): GoldenReport {
  const counts: Record<Verdict, number> = { ...ZERO };
  const margins: number[] = [];
  const wrongSheets: string[] = [];
  let elapsedMs = 0;
  let answerable = 0;
  let answeredCorrect = 0;

  for (const record of records) {
    add(counts, record.counts);
    elapsedMs += record.elapsedMs;
    if (record.counts.wrong > 0 || !record.asked) wrongSheets.push(record.id);
    for (const question of record.questions) {
      // Only a decided letter carries a meaningful margin, and only a question
      // the paper answered belongs in the reading denominator.
      if (question.decided) margins.push(question.margin);
      if (!question.answerable) continue;
      answerable += 1;
      if (question.verdict === 'correct') answeredCorrect += 1;
    }
  }

  const strata = [...new Set(records.map((record) => record.stratum))].map((stratum) => {
    const mine = records.filter((record) => record.stratum === stratum);
    const own: Record<Verdict, number> = { ...ZERO };
    for (const record of mine) add(own, record.counts);
    return {
      stratum,
      cases: mine.length,
      asked: mine.filter((record) => record.asked).length,
      questions: total(own),
      counts: own,
      accuracy: rate(own.correct, total(own)),
      // Ordered so a reader meets the smallest stratum's floor first.
    } satisfies StratumSummary;
  });

  const questions = total(counts);
  const accuracy = rate(counts.correct, questions);
  const answeredAccuracy = rate(answeredCorrect, answerable);
  const flagRate = rate(counts.flagged + counts.missed, questions);
  const refusedWrongly = records.filter((record) => !record.asked && record.wanted === 'graded');
  const marginP1 = firstPercentile(margins);
  const armed = realPapers >= PAPERS_TO_ARM;

  const gates: GateResult[] = [
    {
      gate: 'no silent wrong answer',
      armed: true,
      passed: counts.wrong === 0,
      detail: `${String(counts.wrong)} confident answers disagreed with the paper`,
    },
    {
      gate: 'every case ends the way it was designed to',
      armed: true,
      passed: records.every((record) => record.asked),
      detail:
        refusedWrongly.length === 0
          ? 'all cases graded or refused as designed'
          : `refused when they should have graded: ${refusedWrongly.map((record) => record.id).join(', ')}`,
    },
    {
      gate: 'accuracy at or above 99.7 percent',
      armed,
      passed: !armed || accuracy >= 0.997,
      detail: armed
        ? `${(accuracy * 100).toFixed(2)} percent over ${String(questions)} questions`
        : `${(accuracy * 100).toFixed(2)} percent on SYNTHETIC pages, which is not the claim: ${String(realPapers)} of ${String(PAPERS_TO_ARM)} real papers collected`,
    },
    {
      gate: 'per stratum floor of 98 percent',
      armed,
      passed: !armed || strata.every((entry) => entry.accuracy >= 0.98),
      detail: strata
        .map((entry) => `${entry.stratum} ${(entry.accuracy * 100).toFixed(1)}`)
        .join(', '),
    },
    {
      // Defense د20's alphabet as a gate. This is the one that sees a flag
      // riding on a correct answer, which every count based metric misses.
      gate: 'the marks string carries what the paper carries',
      armed: true,
      passed: records.every((record) => record.charFault === ''),
      detail:
        records
          .filter((record) => record.charFault !== '')
          .map((record) => `${record.id} ${record.charFault}`)
          .join('; ') || 'every case wrote the alphabet it declared',
    },
    {
      gate: 'margin: first percentile above the uncertain band',
      armed: true,
      passed: marginP1 > 0,
      detail: `first percentile of the margin of DECIDED answers ${marginP1.toFixed(3)}`,
    },
    {
      // A ratchet against this repository's own number, and NOT the published
      // claim: it says the synthetic sweep still reads what it read yesterday.
      // [measured] It is the gate a blinded engine fails: raising `minInk` to
      // 0.99 takes this from 100 percent to 19.2 while every other armed gate
      // stays green.
      gate: 'synthetic regression: answers still read',
      armed: true,
      passed: answeredAccuracy >= MIN_ANSWERED_ACCURACY,
      detail: `${(answeredAccuracy * 100).toFixed(2)} percent of ${String(answerable)} answered questions read correctly, floor ${(MIN_ANSWERED_ACCURACY * 100).toFixed(0)}`,
    },
  ];

  return {
    tier: 'synthetic',
    cases: records.length,
    questions,
    answerable,
    answeredCorrect,
    answeredAccuracy,
    counts,
    accuracy,
    flagRate,
    wrongSheets,
    strata,
    marginP1,
    gates,
    elapsedMs,
    caveat:
      'Synthetic pages drawn from the same layout object the engine reads. This measures whether the named defenses work and whether a change moved a number. It does NOT measure accuracy on paper: no rasteriser, no toner, no graphite and no camera are involved, and the accuracy gate stays disarmed until 30 real papers are captured.',
  };
}

/** The sweep as a table a person reads, rather than as JSON a person greps. */
export function formatReport(report: GoldenReport): string {
  const lines = [
    `golden sweep, tier ${report.tier}: ${String(report.cases)} cases, ${String(report.questions)} questions, ${(report.elapsedMs / 1000).toFixed(1)}s`,
    '',
    'stratum      cases  asked  questions  correct  flagged  missed  wrong  accuracy',
  ];
  for (const entry of report.strata) {
    lines.push(
      [
        entry.stratum.padEnd(12),
        String(entry.cases).padStart(5),
        String(entry.asked).padStart(6),
        String(entry.questions).padStart(10),
        String(entry.counts.correct).padStart(8),
        String(entry.counts.flagged).padStart(8),
        String(entry.counts.missed).padStart(7),
        String(entry.counts.wrong).padStart(6),
        `${(entry.accuracy * 100).toFixed(2)}%`.padStart(10),
      ].join(' '),
    );
  }
  lines.push(
    '',
    `answered questions: ${String(report.answeredCorrect)} of ${String(report.answerable)} read correctly (${(report.answeredAccuracy * 100).toFixed(2)}%), and the other ${String(report.questions - report.answerable)} questions were blank by design`,
    `margin, first percentile over decided answers: ${report.marginP1.toFixed(3)}`,
    '',
  );
  for (const gate of report.gates) {
    const state = !gate.armed ? 'not armed' : gate.passed ? 'pass' : 'FAIL';
    lines.push(`[${state.padEnd(9)}] ${gate.gate}: ${gate.detail}`);
  }
  lines.push('', report.caveat);
  return lines.join('\n');
}
