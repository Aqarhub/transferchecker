// Running one case and scoring it against what the paper says.
//
// The engine's output is never consulted about what the answer should be. The
// expectation comes from `truth.ts`, which reads the marks the case asked for,
// and this file only compares.

import type { GroupOutcome } from '../../src/decide/group';
import { scanSheet } from '../../src/scan/pipeline';
import type { ScanResult } from '../../src/scan/result';
import type { GoldenCase, Stratum } from './corpus';
import { sheetOf } from './corpus';
import { imageOf } from './image';
import { expectedOf, verdictOf } from './truth';
import type { Expected, Verdict } from './truth';

export interface QuestionRecord {
  readonly question: number;
  readonly expected: Expected;
  readonly outcome: string;
  readonly verdict: Verdict;
  /** How far the decision was from the threshold it would have had to cross. */
  readonly margin: number;
}

export interface CaseRecord {
  readonly id: string;
  readonly stratum: Stratum;
  readonly template: string;
  readonly why: string;
  /** 'graded' or the rejection cause, as the engine actually answered. */
  readonly got: string;
  /** What the case demanded. */
  readonly wanted: string;
  /** True when the sheet as a whole did what it was supposed to do. */
  readonly asked: boolean;
  readonly questions: readonly QuestionRecord[];
  readonly counts: Readonly<Record<Verdict, number>>;
  readonly elapsedMs: number;
}

const EMPTY: Record<Verdict, number> = { correct: 0, flagged: 0, missed: 0, wrong: 0 };

/** The outcome as one short string, so a report diff reads as a sentence. */
function label(outcome: GroupOutcome): string {
  switch (outcome.kind) {
    case 'answer':
      return `answer:${outcome.symbol}${outcome.uncertain ? '?' : ''}${outcome.escaped ? 'x' : ''}`;
    case 'multiple':
      return `multiple:${outcome.symbols.join('')}`;
    case 'ambiguous':
      return `ambiguous:${outcome.reason}`;
    case 'blank':
      return outcome.trace ? 'blank:trace' : 'blank';
    case 'unmeasurable':
      return 'unmeasurable';
  }
}

/** Every mark the case aimed at one question, so truth can be derived per group. */
function marksByQuestion(item: GoldenCase): Map<number, typeof item.marks> {
  const byQuestion = new Map<number, (typeof item.marks)[number][]>();
  for (const mark of item.marks) {
    if (!mark.groupId.startsWith('q:')) continue;
    const question = Number(mark.groupId.slice(2));
    const held = byQuestion.get(question) ?? [];
    held.push(mark);
    byQuestion.set(question, held);
  }
  return byQuestion;
}

export function runCase(item: GoldenCase): CaseRecord {
  const started = Number(process.hrtime.bigint() / 1000n) / 1000;
  const result: ScanResult = scanSheet(imageOf(item));
  const elapsedMs = Number(process.hrtime.bigint() / 1000n) / 1000 - started;

  const got = result.kind === 'ok' ? 'graded' : result.reason.kind;
  const asked = got === item.expect;

  // A refused sheet has no per question record, and that is not a hole in the
  // measurement: refusing when the case demanded a refusal is the correct
  // answer, and refusing when it did not is counted as the sheet failing.
  if (result.kind !== 'ok') {
    return {
      id: item.id,
      stratum: item.stratum,
      template: item.template,
      why: item.why,
      got,
      wanted: item.expect,
      asked,
      questions: [],
      counts: { ...EMPTY },
      elapsedMs,
    };
  }

  const { layout } = sheetOf(item.template);
  const aimed = marksByQuestion(item);
  const questions: QuestionRecord[] = [];
  const counts: Record<Verdict, number> = { ...EMPTY };

  for (const column of layout.questionColumns) {
    for (const row of column.rows) {
      const reading = result.sheet.questions.find((entry) => entry.question === row.question);
      if (reading === undefined) continue;
      const expected = expectedOf(aimed.get(row.question) ?? []);
      const verdict = verdictOf(expected, reading.outcome);
      counts[verdict] += 1;
      questions.push({
        question: row.question,
        expected,
        outcome: label(reading.outcome),
        verdict,
        margin: 'margin' in reading.outcome ? reading.outcome.margin : 0,
      });
    }
  }

  return {
    id: item.id,
    stratum: item.stratum,
    template: item.template,
    why: item.why,
    got,
    wanted: item.expect,
    asked,
    questions,
    counts,
    elapsedMs,
  };
}
