// The data behind every screen, computed rather than invented.
//
// A dashboard drawn from made up numbers is a picture of a dashboard. Every
// figure on these screens comes from `packages/grading` running over a class of
// answer strings in the format the database actually stores, so the tables add
// up, the item analysis is a real analysis, and a change to the scoring rules
// changes what the screens show.
//
// It also means the layout is tested against the awkward cases rather than the
// tidy one: a paper the machine would not read, an unkeyed question, a name
// long enough to wrap, an identifier with leading zeros.

import { analyseItems, gradeStored, readRoster, tagReport } from '@transferchecker/grading';
import type { AnalysedPaper, AnswerKey, Grade, Student } from '@transferchecker/grading';
import { decodeAnswers } from '@transferchecker/grading';

const CLASS_CSV = `الرقم,الاسم
00713,عَبْدُالله الزهراني
00007,سارة القحطاني
01024,"الشمري, خالد"
00318,نورة بنت محمد العتيبي
02145,فيصل الدوسري
00099,ريم الغامدي`;

/** Twelve questions, weighted, tagged, and one of them deliberately unkeyed. */
export const KEY: AnswerKey = {
  form: 'A',
  questions: [
    { intended: 0, points: 1, awards: [], tags: ['كسور'] },
    { intended: 2, points: 1, awards: [], tags: ['كسور'] },
    { intended: 1, points: 1, awards: [{ index: 3, points: 0.5 }], tags: ['كسور', 'معيار-3.2'] },
    { intended: 3, points: 2, awards: [], tags: ['هندسة'] },
    { intended: 0, points: 1, awards: [], tags: ['هندسة'] },
    { intended: 2, points: 1, awards: [], tags: ['قياس'] },
    { intended: 1, points: 1, awards: [], tags: ['قياس'] },
    { intended: 3, points: 1, awards: [], tags: ['كسور'] },
    { intended: 0, points: 1.5, awards: [], tags: ['هندسة'] },
    { intended: 2, points: 1, awards: [], tags: ['قياس'] },
    { intended: null, points: 1, awards: [], tags: [] },
    { intended: 1, points: 1, awards: [], tags: ['كسور'] },
  ],
};

/**
 * Six papers, written as the strings the database holds.
 *
 * `?` is a question the student left, `!` is one the machine would not decide.
 * Both appear here on purpose: they are the two states a dashboard built on
 * happy paths gets wrong, and they are the two the design system has a rule
 * about (never invent a value for a missing one).
 */
const PAPERS: readonly { answers: string; marks: string; at: string }[] = [
  { answers: '021301132021', marks: 'cccccccccccb', at: '2026-08-14' },
  { answers: '02130113202?', marks: 'ccccccccccbb', at: '2026-08-14' },
  { answers: '0213011!2021', marks: 'ccccccdcccc b'.replace(' ', ''), at: '2026-08-14' },
  { answers: '331301132021', marks: 'ecccccccccc b'.replace(' ', ''), at: '2026-08-15' },
  { answers: '021311132001', marks: 'ccccucccccc b'.replace(' ', ''), at: '2026-08-15' },
  { answers: '3213?1132021', marks: 'ccccbccccccb', at: '2026-08-15' },
];

export interface Paper {
  readonly student: Student;
  readonly grade: Grade;
  readonly marks: string;
  readonly answers: string;
  readonly scannedAt: string;
}

export function roster(): Student[] {
  return [...readRoster(CLASS_CSV).students];
}

export function papers(): Paper[] {
  const students = roster();
  return PAPERS.flatMap((paper, at) => {
    const student = students[at];
    const grade = gradeStored(KEY, paper.answers, paper.marks);
    if (student === undefined || grade === null) return [];
    return [{ student, grade, marks: paper.marks, answers: paper.answers, scannedAt: paper.at }];
  });
}

export function analysed(): AnalysedPaper[] {
  return papers().flatMap((paper) => {
    const answers = decodeAnswers(paper.answers, KEY.questions.length);
    return answers === null ? [] : [{ answers, grade: paper.grade }];
  });
}

export const items = (): ReturnType<typeof analyseItems> => analyseItems(KEY, analysed());
export const tags = (): ReturnType<typeof tagReport> => tagReport(KEY, analysed());

export interface ClassSummary {
  readonly papers: number;
  readonly mean: number | null;
  readonly total: number;
  readonly needsReview: number;
  readonly unresolved: number;
}

export function summary(): ClassSummary {
  const all = papers();
  if (all.length === 0) return { papers: 0, mean: null, total: 0, needsReview: 0, unresolved: 0 };
  const total = all[0]?.grade.total ?? 0;
  return {
    papers: all.length,
    mean: all.reduce((sum, paper) => sum + paper.grade.score, 0) / all.length,
    total,
    needsReview: all.filter((paper) => paper.grade.needsReview).length,
    unresolved: all.reduce((sum, paper) => sum + paper.grade.unresolved, 0),
  };
}
