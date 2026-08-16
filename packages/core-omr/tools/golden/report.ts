// Aggregating the sweep, and the gates that read the aggregate.
//
// Nine gates, and only some of them can be armed today. That distinction is
// carried in the report itself rather than in a comment somewhere, because the
// number this project publishes about its own accuracy is a marketing claim in
// PLAN.md section 8ب, and a synthetic sweep that reports "100 percent" without
// saying what it measured would be the most expensive lie in the repository.
//
// THE UNIT IS THE QUESTION, and it is settled in PLAN.md section 11ب and in
// docs/FAILURE-MODES.md section 4ب-9أ rather than here. The short version,
// because a number without its denominator is not a number: on a fifty question
// sheet the same 99.7 percent means 0.75 bad bubbles per paper read per bubble,
// 0.15 bad questions per paper read per question, and one bad paper in 333 read
// per paper. Those are 250 to 1 apart, so the denominator has to be printed
// beside the number everywhere it appears, including here.
//
// And three numbers are published together or none of them is, which is
// acceptance criterion 14: accuracy, the warning rate and the refusal rate. Each
// of the three is trivially perfect when the other two are free to move, and a
// product that refuses every sheet scores 100 percent on the first.

import type { CaseRecord } from './score';
import type { Verdict } from './truth';

export interface StratumSummary {
  readonly stratum: string;
  readonly cases: number;
  /** Cases that ended the way the case demanded, graded or refused. */
  readonly asked: number;
  readonly questions: number;
  readonly counts: Readonly<Record<Verdict, number>>;
  /** One minus the share of questions this stratum misgraded in silence. */
  readonly accuracy: number;
}

export interface GateResult {
  readonly gate: string;
  readonly armed: boolean;
  readonly passed: boolean;
  readonly detail: string;
}

export interface GoldenReport {
  /**
   * What kind of evidence this report is over, derived and never declared.
   *
   * A report that says `synthetic` while holding real papers, or the reverse,
   * would be the one sentence in the artifact that everything else rests on
   * being wrong, so it is a function of how many real papers arrived rather
   * than a constant somebody remembers to change.
   */
  readonly tier: 'synthetic' | 'paper';
  readonly cases: number;
  readonly questions: number;
  /**
   * Questions where the paper carried one unambiguous answer, and how many of
   * those came back carrying that letter.
   *
   * This pair is the regression ratchet and NOT the published accuracy. It has
   * a denominator the corpus controls: [measured] of 710 quick tier questions
   * 463 expect blank and 244 expect an answer, so an engine that answers
   * NOTHING would score 65.2 percent on a headline taken over all questions,
   * and adding blank pages would raise it for free.
   */
  readonly answerable: number;
  readonly answersRead: number;
  readonly readRate: number;
  readonly counts: Readonly<Record<Verdict, number>>;
  /**
   * THE PUBLISHED NUMBER, per question: one minus the share of questions that
   * were misgraded in silence.
   *
   * Silence is the whole of the definition. A question the engine got wrong
   * with confidence, and a question whose answer it quietly dropped, both send
   * a wrong grade home in a schoolbag with nothing on the record to say so.
   * A question it flagged did not: the teacher was told, and the cost of that
   * is a look, which is what the warning rate below measures instead. Putting
   * doubt inside accuracy would make the ratchet turn one way in silence, which
   * is the exact hole acceptance criterion 14 exists to close: every defense in
   * this engine converts a silent error into a flag or a refusal, so an
   * accuracy that counts flags against us would fall every time the engine got
   * safer, and one that ignores refusals would reward a product that refuses
   * everything.
   */
  readonly accuracy: number;
  /** Questions the record hands back with a flag on them, and their share. */
  readonly warned: number;
  readonly warnRate: number;
  /**
   * The same budget counted per PAPER, because the two are not interchangeable
   * and the difference decides whether a class is usable.
   *
   * [computed] Two percent of the questions of a hundred question sheet is two
   * flagged questions per paper. Spread evenly that is 86.7 percent of a class
   * of 30 carrying at least one flag, so the teacher opens 26 papers; landing
   * all of it on single papers is 0.6 of 30, so they open one. Same budget, and
   * the classroom experiences are not comparable.
   */
  readonly papersWarned: number;
  readonly paperWarnRate: number;
  /** Papers the engine refused although the case asked it to grade, and their share. */
  readonly gradedPapers: number;
  readonly refused: number;
  readonly rejectRate: number;
  readonly wrongSheets: readonly string[];
  readonly strata: readonly StratumSummary[];
  /** First percentile of the decision margin over answers the engine was sure of. */
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

/** A share of a denominator that may legitimately be empty, read as "nothing lost". */
const rate = (part: number, whole: number): number => (whole === 0 ? 1 : part / whole);

/** And the other direction, where an empty denominator means "nothing happened". */
const share = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);

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
 * The floor under the share of drawn answers that still come back.
 *
 * [measured] The working engine returns 100 percent of them on this corpus, so
 * the floor is a ratchet with room rather than a target to tune toward. It is
 * not the published accuracy claim and the report says so: this counts only
 * questions the corpus drew one solid mark on, on pages the corpus drew.
 */
const MIN_READ_RATE = 0.98;

/**
 * The budgets of acceptance criterion 14, both stated per its own unit.
 *
 * They are here rather than only in the document because the document is not
 * what a build reads. The translation is in PLAN.md section 11ب: on a fifty
 * question sheet these come to one flagged question per paper and 0.6 refused
 * papers per class of thirty, which is a refusal every 1.67 classes.
 */
const MAX_WARN_RATE = 0.02;
const MAX_REJECT_RATE = 0.02;

export function summarise(records: readonly CaseRecord[], realPapers = 0): GoldenReport {
  const counts: Record<Verdict, number> = { ...ZERO };
  const margins: number[] = [];
  const wrongSheets: string[] = [];
  let elapsedMs = 0;
  let answerable = 0;
  let answersRead = 0;
  let warned = 0;
  let papersWarned = 0;

  for (const record of records) {
    add(counts, record.counts);
    elapsedMs += record.elapsedMs;
    if (record.counts.wrong > 0 || !record.asked) wrongSheets.push(record.id);
    if (record.questions.some((question) => question.warned)) papersWarned += 1;
    for (const question of record.questions) {
      // Only an answer the engine was sure of carries a meaningful margin, and
      // only a question the paper answered outright belongs in the ratchet.
      if (question.decided) margins.push(question.margin);
      if (question.warned) warned += 1;
      if (!question.answerable) continue;
      answerable += 1;
      if (question.named) answersRead += 1;
    }
  }

  const questions = total(counts);
  const silentlyWrong = (own: Readonly<Record<Verdict, number>>): number => own.missed + own.wrong;

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
      accuracy: 1 - share(silentlyWrong(own), total(own)),
      // Ordered so a reader meets the smallest stratum's floor first.
    } satisfies StratumSummary;
  });

  const accuracy = 1 - share(silentlyWrong(counts), questions);
  const readRate = rate(answersRead, answerable);
  const warnRate = share(warned, questions);
  const graded = records.filter((record) => record.wanted === 'graded');
  const refusedWrongly = records.filter((record) => !record.asked && record.wanted === 'graded');
  // Papers the engine refused although the case asked for a grade. A refusal a
  // case ASKED for is the defense working and is never counted here.
  const rejectRate = graded.length === 0 ? 0 : refusedWrongly.length / graded.length;
  const paperWarnRate = records.length === 0 ? 0 : papersWarned / records.length;
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
      // The unit is in the name of the gate on purpose. It is the number that
      // leaves this repository, and it left it once already with no denominator
      // attached to it anywhere in the documents.
      gate: 'accuracy at or above 99.7 percent of questions',
      armed,
      passed: !armed || accuracy >= 0.997,
      detail: armed
        ? `${(accuracy * 100).toFixed(2)} percent of ${String(questions)} questions, ${String(silentlyWrong(counts))} misgraded in silence`
        : `${(accuracy * 100).toFixed(2)} percent on SYNTHETIC pages, which is not the claim: ${String(realPapers)} of ${String(PAPERS_TO_ARM)} real papers collected`,
    },
    {
      gate: 'per stratum floor of 98 percent of questions',
      armed,
      passed: !armed || strata.every((entry) => entry.accuracy >= 0.98),
      detail: strata
        .map((entry) => `${entry.stratum} ${(entry.accuracy * 100).toFixed(1)}`)
        .join(', '),
    },
    {
      // Acceptance criterion 14's other half, and it is armed today because it
      // is a property of a corpus we own rather than of paper we do not have.
      // Without it the accuracy definition above has an open flank: an engine
      // that flags every question scores a perfect accuracy and is useless.
      gate: 'warnings at or below 2 percent of questions',
      armed: true,
      passed: warnRate <= MAX_WARN_RATE,
      detail: `${(warnRate * 100).toFixed(2)} percent of ${String(questions)} questions carry a flag, and ${String(papersWarned)} of ${String(records.length)} papers carry at least one (${(paperWarnRate * 100).toFixed(1)} percent)`,
    },
    {
      // And the third of the three that are published together or not at all.
      gate: 'refusals at or below 2 percent of papers',
      armed: true,
      passed: rejectRate <= MAX_REJECT_RATE,
      detail: `${(rejectRate * 100).toFixed(2)} percent of ${String(graded.length)} papers that asked to be graded were refused`,
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
      detail: `first percentile of the margin of answers the engine was SURE of ${marginP1.toFixed(3)}, over ${String(margins.length)} of them`,
    },
    {
      // A ratchet against this repository's own number, and NOT the published
      // claim: it says the synthetic sweep still reads what it read yesterday.
      // [measured] It is the gate a blinded engine fails: raising `minInk` to
      // 0.99 takes this from 100 percent to 0 while every other armed gate
      // stays green. It asks whether the letter came back, not whether it came
      // back unflagged, because doubt is the warning rate's business and a
      // ratchet that punished doubt would punish this corpus for being honest.
      gate: 'synthetic regression: a drawn answer still comes back',
      armed: true,
      passed: readRate >= MIN_READ_RATE,
      detail: `${(readRate * 100).toFixed(2)} percent of ${String(answerable)} drawn answers came back, floor ${(MIN_READ_RATE * 100).toFixed(0)}`,
    },
  ];

  const tier = realPapers > 0 ? 'paper' : 'synthetic';
  return {
    tier,
    cases: records.length,
    questions,
    answerable,
    answersRead,
    readRate,
    counts,
    accuracy,
    warned,
    warnRate,
    papersWarned,
    paperWarnRate,
    gradedPapers: graded.length,
    refused: refusedWrongly.length,
    rejectRate,
    wrongSheets,
    strata,
    marginP1,
    gates,
    elapsedMs,
    caveat:
      (tier === 'synthetic'
        ? 'Synthetic pages drawn from the same layout object the engine reads. This measures whether the named defenses work and whether a change moved a number. It does NOT measure accuracy on paper: no rasteriser, no toner, no graphite and no camera are involved, and the accuracy gate stays disarmed until 30 real papers are captured.'
        : `Real paper: ${String(realPapers)} of ${String(PAPERS_TO_ARM)} sheets read by hand and verified against their hashes, mixed with the synthetic corpus. Every stratum is reported separately because a total hides an environment that does not work.`) +
      ' The unit of every rate here is the question, except the refusal rate and the paper warning share, whose unit is the paper.',
  };
}

/** The sweep as a table a person reads, rather than as JSON a person greps. */
export function formatReport(report: GoldenReport): string {
  const lines = [
    `golden sweep, tier ${report.tier}: ${String(report.cases)} cases, ${String(report.questions)} questions, ${(report.elapsedMs / 1000).toFixed(1)}s`,
    '',
    'stratum                   cases  asked  questions  correct  flagged  missed  wrong  accuracy',
  ];
  for (const entry of report.strata) {
    lines.push(
      [
        entry.stratum.padEnd(25),
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
    `the three that are published together, per acceptance criterion 14:`,
    `  accuracy    ${(report.accuracy * 100).toFixed(3)}% of ${String(report.questions)} QUESTIONS (${String(report.counts.missed + report.counts.wrong)} misgraded in silence, of which ${String(report.counts.wrong)} confident)`,
    `  warnings    ${(report.warnRate * 100).toFixed(3)}% of questions, on ${String(report.papersWarned)} of ${String(report.cases)} papers (${(report.paperWarnRate * 100).toFixed(1)}%)`,
    `  refusals    ${(report.rejectRate * 100).toFixed(3)}% of the ${String(report.gradedPapers)} papers that asked to be graded`,
    '',
    `drawn answers that came back: ${String(report.answersRead)} of ${String(report.answerable)} (${(report.readRate * 100).toFixed(2)}%), and the other ${String(report.questions - report.answerable)} questions were blank or deliberately borderline by design`,
    `margin, first percentile over answers the engine was sure of: ${report.marginP1.toFixed(3)}`,
    '',
  );
  for (const gate of report.gates) {
    const state = !gate.armed ? 'not armed' : gate.passed ? 'pass' : 'FAIL';
    lines.push(`[${state.padEnd(9)}] ${gate.gate}: ${gate.detail}`);
  }
  lines.push('', report.caveat);
  return lines.join('\n');
}
