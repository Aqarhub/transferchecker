// Running one case and scoring it against what the paper says.
//
// The engine's output is never consulted about what the answer should be. The
// expectation comes from `truth.ts`, which reads the marks the case asked for,
// and this file only compares.

import type { SheetLayout } from '@transferchecker/sheet-spec';
import type { GroupOutcome } from '../../src/decide/group';
import { markOf } from '../../src/decide/group';
import type { Thresholds } from '../../src/decide/thresholds';
import { scanSheet } from '../../src/scan/pipeline';
import type { ScanResult } from '../../src/scan/result';
import type { GoldenCase } from './corpus';
import { sheetOf } from './corpus';
import { imageOf } from './image';
import { expectedOf, names, verdictOf } from './truth';
import type { Expected, Verdict } from './truth';

export interface QuestionRecord {
  readonly question: number;
  readonly expected: Expected;
  readonly outcome: string;
  readonly verdict: Verdict;
  /** How far the decision was from the threshold it would have had to cross. */
  readonly margin: number;
  /**
   * Whether the engine named a letter here AND claimed to be sure of it.
   *
   * The margin only means something on these, and for two separate reasons. A
   * blank's margin is the distance DOWN to the floor, so an engine blinded by
   * raising the floor reports the widest margins in the corpus: [measured]
   * `minInk` at 0.99 reads nothing at all, 185 of 229 answered questions come
   * back blank, and its first percentile margin is 0.849 against the working
   * engine's 0.119. And an answer the engine already flagged as uncertain is
   * not a silent risk, it is a surfaced one, so leaving it in would let the
   * corpus lower its own leading indicator every time it gains an honestly
   * doubtful mark. What watches the size of that flagged population instead is
   * the warning rate, which is a gate of its own.
   */
  readonly decided: boolean;
  /**
   * Whether the paper carried one unambiguous answer here.
   *
   * Deliberately narrower than "the paper carried something": a mark drawn at
   * the edge of what a mark is (`either`) has no single right reading, so it
   * cannot be in the denominator of a ratchet that asks whether answers still
   * read. [measured] Both non correct questions of the quick tier are exactly
   * that, and counting them dragged the probe set's baseline to 97.26 percent,
   * under its own 98 percent floor, which disarmed the ratchet against every
   * mutant it was written to catch.
   */
  readonly answerable: boolean;
  /** Whether the engine came back with the letter the paper carries, sure or not. */
  readonly named: boolean;
  /**
   * Whether this question costs the teacher a look, as the stored record shows
   * it: any mark character other than a clean answer or a blank.
   *
   * Taken from the record rather than from the verdict because the budget in
   * acceptance criterion 14 is a promise about what a teacher opens, and a
   * question the corpus scores `correct` because it was correctly called
   * ambiguous still stops them.
   */
  readonly warned: boolean;
}

export interface CaseRecord {
  readonly id: string;
  /**
   * A string rather than the synthetic `Stratum`, because tier 3 strata are
   * environmental: `phone/daylight/flat` is the unit acceptance criterion 14
   * asks for a separate accuracy floor on. Widening it here is what lets a real
   * paper and a drawn one flow into the same report and the same gates instead
   * of growing a second scoring path that can disagree with this one.
   */
  readonly stratum: string;
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

/** What a scored sheet needs to know about itself, drawn or photographed. */
export interface Scoreable {
  readonly id: string;
  readonly stratum: string;
  readonly template: string;
  readonly why: string;
  /** 'graded' or the rejection cause this sheet is supposed to produce. */
  readonly wanted: string;
  readonly layout: SheetLayout;
  /**
   * The truth, per question, from the paper and never from the engine. Null for
   * a question that has no truth yet, which is skipped rather than guessed.
   */
  readonly expectedFor: (question: number) => Expected | null;
  readonly chars: GoldenCase['chars'];
}

/**
 * Scoring one scan, shared by the drawn corpus and by real paper.
 *
 * One function rather than two, because the moment tier 3 gets its own copy of
 * this loop the two definitions of a wrong answer start to drift, and the one
 * that drifts is always the one nobody is running yet.
 */
export function scoreResult(sheet: Scoreable, result: ScanResult, elapsedMs: number): CaseRecord {
  const got = result.kind === 'ok' ? 'graded' : result.reason.kind;
  const asked = got === sheet.wanted;

  // A refused sheet has no per question record, and that is not a hole in the
  // measurement: refusing when the case demanded a refusal is the correct
  // answer, and refusing when it did not is counted as the sheet failing.
  if (result.kind !== 'ok') {
    return {
      id: sheet.id,
      stratum: sheet.stratum,
      template: sheet.template,
      why: sheet.why,
      got,
      wanted: sheet.wanted,
      asked,
      questions: [],
      counts: { ...EMPTY },
      marks: '',
      charFault: '',
      elapsedMs,
    };
  }

  const questions: QuestionRecord[] = [];
  const counts: Record<Verdict, number> = { ...EMPTY };

  for (const column of sheet.layout.questionColumns) {
    for (const row of column.rows) {
      const reading = result.sheet.questions.find((entry) => entry.question === row.question);
      if (reading === undefined) continue;
      const expected = sheet.expectedFor(row.question);
      if (expected === null) continue;
      const verdict = verdictOf(expected, reading.outcome);
      const outcome = reading.outcome;
      const sure = (outcome.kind === 'answer' || outcome.kind === 'multiple') && !outcome.uncertain;
      const mark = markOf(outcome);
      counts[verdict] += 1;
      questions.push({
        question: row.question,
        expected,
        outcome: label(outcome),
        verdict,
        margin: 'margin' in outcome ? outcome.margin : 0,
        decided: sure,
        answerable: expected.kind === 'answer',
        named:
          expected.kind === 'blank' || expected.kind === 'flagged'
            ? false
            : names(outcome, expected.symbol),
        warned: mark !== 'c' && mark !== 'b',
      });
    }
  }

  return {
    id: sheet.id,
    stratum: sheet.stratum,
    template: sheet.template,
    why: sheet.why,
    got,
    wanted: sheet.wanted,
    asked,
    questions,
    counts,
    marks: result.sheet.marks,
    charFault: charFaultOf(sheet.chars, result.sheet.marks),
    elapsedMs,
  };
}

export function runCase(item: GoldenCase, thresholds?: Thresholds): CaseRecord {
  const started = Number(process.hrtime.bigint() / 1000n) / 1000;
  const result: ScanResult = scanSheet(
    imageOf(item),
    thresholds === undefined ? {} : { thresholds },
  );
  const elapsedMs = Number(process.hrtime.bigint() / 1000n) / 1000 - started;

  const aimed = marksByQuestion(item);
  return scoreResult(
    {
      id: item.id,
      stratum: item.stratum,
      template: item.template,
      why: item.why,
      wanted: item.expect,
      layout: sheetOf(item.template).layout,
      expectedFor: (question) => expectedOf(aimed.get(question) ?? []),
      chars: item.chars,
    },
    result,
    elapsedMs,
  );
}

/** What the marks string carried that the case did not ask for, or did not carry. */
function charFaultOf(wanted: GoldenCase['chars'], marks: string): string {
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
