// Running one case and scoring it against what the paper says.
//
// The engine's output is never consulted about what the answer should be. The
// expectation comes from `truth.ts`, which reads the marks the case asked for,
// and this file only compares.

import type { GroupOutcome } from '../../src/decide/group';
import type { Thresholds } from '../../src/decide/thresholds';
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
  /**
   * Whether the engine actually named a letter here.
   *
   * The margin only means something on these. A blank's margin is the distance
   * DOWN to the floor, so an engine blinded by raising the floor reports the
   * widest margins in the corpus: [measured] `minInk` at 0.99 reads nothing at
   * all, 185 of 229 answered questions come back blank, and its first
   * percentile margin is 0.849 against the working engine's 0.119. A leading
   * indicator that rewards blindness is worse than none.
   */
  readonly decided: boolean;
  /** Whether the paper carried an answer here, which is the honest denominator. */
  readonly answerable: boolean;
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
  /** Defense د20's one character per question, as the engine wrote it. */
  readonly marks: string;
  /** Empty when the marks string carried what the case says it should. */
  readonly charFault: string;
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

export function runCase(item: GoldenCase, thresholds?: Thresholds): CaseRecord {
  const started = Number(process.hrtime.bigint() / 1000n) / 1000;
  const result: ScanResult = scanSheet(
    imageOf(item),
    thresholds === undefined ? {} : { thresholds },
  );
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
      marks: '',
      charFault: '',
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
        decided: reading.outcome.kind === 'answer' || reading.outcome.kind === 'multiple',
        answerable: expected.kind === 'answer' || expected.kind === 'either',
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
    marks: result.sheet.marks,
    charFault: charFaultOf(item, result.sheet.marks),
    elapsedMs,
  };
}

/** What the marks string carried that the case did not ask for, or did not carry. */
function charFaultOf(item: GoldenCase, marks: string): string {
  const wanted = item.chars;
  if (wanted === undefined) return '';
  const present = new Set(marks);

  const only = wanted.only;
  if (only !== undefined) {
    const extra = [...present].filter((char) => !only.includes(char));
    if (extra.length > 0) {
      return `carries ${extra.join('')} but may only carry ${only.join('')}`;
    }
  }

  const atLeast = wanted.atLeast ?? [];
  const absent = atLeast.filter((char) => !present.has(char));
  return absent.length === 0 ? '' : `does not carry ${absent.join('')}`;
}
