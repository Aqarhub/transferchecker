// What the screens are drawn from, which is now rows rather than constants.
//
// This file used to hold a class as literals: a roster in a template string, six
// answer strings, a key. The numbers were computed rather than invented, which
// was the right half of the problem, but nothing they were computed from had
// ever been through a database.
//
// Now every figure on every screen comes out of `@transferchecker/db` through
// the queries a server will run: the answers are read from `scans.answers`, the
// key is rebuilt from the four columns `answer_keys` holds, and the roster comes
// from `students` with its leading zeros intact. The grading itself is still
// `packages/grading`, because that is where it belongs and a dashboard that did
// its own arithmetic would be a second implementation of the scoring rules.
//
// AND THE SCORE IS RECOMPUTED RATHER THAN READ OUT OF `scans.score`. A teacher
// who fixes a badly worded question expects the class to be re-marked from the
// answers already stored, with nothing rescanned. Showing the stored score would
// show the answer from before the fix.

import { analyseItems, decodeAnswers, gradeStored, tagReport } from '@transferchecker/grading';
import type { AnalysedPaper, AnswerKey, Grade, Student } from '@transferchecker/grading';
import { examDataOf } from '@transferchecker/db';
import type { Database, ExamData } from '@transferchecker/db';

export interface Paper {
  /**
   * Null for a paper whose identity grid could not be read.
   *
   * A real state rather than an edge case: the sheet has answers and a score,
   * and nobody knows whose it is yet. The screen shows it without a name rather
   * than dropping it, because a paper that vanishes from a list is a mark a
   * pupil never receives.
   */
  readonly student: Student | null;
  readonly grade: Grade;
  readonly marks: string;
  readonly answers: string;
  readonly scannedAt: string;
}

export interface ClassSummary {
  readonly papers: number;
  readonly mean: number | null;
  readonly total: number;
  readonly needsReview: number;
  readonly unresolved: number;
}

export interface Dashboard {
  readonly exam: { readonly title: string; readonly createdAt: string };
  readonly key: AnswerKey;
  readonly roster: readonly Student[];
  readonly papers: readonly Paper[];
  readonly summary: ClassSummary;
  readonly items: ReturnType<typeof analyseItems>;
  readonly tags: ReturnType<typeof tagReport>;
}

const day = (at: Date): string => at.toISOString().slice(0, 10);

function summaryOf(papers: readonly Paper[]): ClassSummary {
  if (papers.length === 0) {
    return { papers: 0, mean: null, total: 0, needsReview: 0, unresolved: 0 };
  }
  return {
    papers: papers.length,
    mean: papers.reduce((sum, paper) => sum + paper.grade.score, 0) / papers.length,
    total: papers[0]?.grade.total ?? 0,
    needsReview: papers.filter((paper) => paper.grade.needsReview).length,
    unresolved: papers.reduce((sum, paper) => sum + paper.grade.unresolved, 0),
  };
}

/**
 * The screens' view of one exam, built from rows.
 *
 * Kept separate from the query so it can be exercised without a database and so
 * the rendering has one obvious input. A scan whose strings do not decode is
 * dropped here rather than displayed as a zero: `gradeStored` returns null for a
 * record whose answers and key disagree about how many questions there are, and
 * a zero would be a mark, not an error.
 */
export function dashboardOf(data: ExamData): Dashboard {
  const byId = new Map(data.roster.map((student) => [student.id, student]));

  const papers: Paper[] = data.scans.flatMap((scan) => {
    const grade = gradeStored(data.key, scan.answers, scan.marks);
    if (grade === null) return [];
    return [
      {
        student: scan.studentExtId === null ? null : (byId.get(scan.studentExtId) ?? null),
        grade,
        marks: scan.marks,
        answers: scan.answers,
        scannedAt: day(scan.createdAt),
      },
    ];
  });

  const analysed: AnalysedPaper[] = papers.flatMap((paper) => {
    const answers = decodeAnswers(paper.answers, data.key.questions.length);
    return answers === null ? [] : [{ answers, grade: paper.grade }];
  });

  return {
    exam: { title: data.exam.title, createdAt: day(data.exam.createdAt) },
    key: data.key,
    roster: data.roster,
    papers,
    summary: summaryOf(papers),
    items: analyseItems(data.key, analysed),
    tags: tagReport(data.key, analysed),
  };
}

/** The same view, read straight out of a database. */
export async function loadDashboard(
  db: Database,
  orgId: string,
  examId: string,
): Promise<Dashboard | null> {
  const data = await examDataOf(db, orgId, examId);
  return data === null ? null : dashboardOf(data);
}
