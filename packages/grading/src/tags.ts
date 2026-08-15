// Tag reports: "how did my students do on fractions".
//
// PLAN.md section 0 calls the custom standards the differentiator that is
// actually local, because tagging a question with a ministry standard is a
// report no competitor produces in Arabic. Section 5 puts the tags on the KEY
// rather than in a table of their own, since a tag describes an exam question
// and not a student's paper, and section 5ب-2 puts the editor for them inside
// the question editor because that is the only moment a teacher is looking at
// the question's content. This file is what makes any of that worth doing.
//
// Everything here is computed from the same stored strings the grades came
// from, so a teacher who tags a question AFTER marking the class gets the
// report immediately and nothing is rescanned. That is the same property
// alternate answers have, and for the same reason: the paper never changes.
//
// The one rule that is not arithmetic: A TAG'S SCORE IS OUT OF THE QUESTIONS
// THAT COUNTED. A question the machine would not decide leaves the tag's
// denominator as well as its numerator, because a student whose fractions
// question was unreadable did not score zero on fractions, and telling a
// teacher they did would send them to reteach a topic on our failure.

import type { Grade } from './grade';
import type { AnswerKey } from './key';
import type { Answer } from './answers';

export interface TagScore {
  readonly tag: string;
  /** One based question numbers carrying this tag, in printed order. */
  readonly questions: readonly number[];
  readonly points: number;
  readonly max: number;
  /** Points over max, and null when nothing under this tag could be counted. */
  readonly share: number | null;
  /** Questions dropped because the machine would not read them. */
  readonly unresolved: number;
}

export interface TaggedPaper {
  readonly answers: readonly Answer[];
  readonly grade: Grade;
}

/** Every tag on the key, in the order a teacher first used it. */
export function tagsOf(key: AnswerKey): string[] {
  const seen: string[] = [];
  for (const question of key.questions) {
    for (const tag of question.tags) if (!seen.includes(tag)) seen.push(tag);
  }
  return seen;
}

/** One paper against every tag on its key. */
export function tagScores(key: AnswerKey, paper: TaggedPaper): TagScore[] {
  return tagsOf(key).map((tag) => {
    const questions: number[] = [];
    let points = 0;
    let max = 0;
    let unresolved = 0;

    for (const [at, question] of key.questions.entries()) {
      if (!question.tags.includes(tag)) continue;
      questions.push(at + 1);
      if (paper.answers[at]?.kind === 'unresolved') {
        unresolved += 1;
        continue;
      }
      const entry = paper.grade.questions[at];
      points += entry?.awarded ?? 0;
      max += entry?.max ?? 0;
    }

    return { tag, questions, points, max, share: max === 0 ? null : points / max, unresolved };
  });
}

export interface TagReport {
  /** The class as one line per tag, which is the report a teacher opens first. */
  readonly overall: readonly TagScore[];
  /** And per paper, for the conversation with one student. */
  readonly perPaper: readonly (readonly TagScore[])[];
  readonly papers: number;
}

/**
 * The whole class, by tag.
 *
 * The class figure is the SUM over papers rather than the mean of the shares.
 * They differ whenever papers have different numbers of countable questions,
 * which is exactly what an unresolved question causes, and a mean of shares
 * would let one paper with a single readable fractions question weigh as much
 * as a paper with six.
 */
export function tagReport(key: AnswerKey, papers: readonly TaggedPaper[]): TagReport {
  const perPaper = papers.map((paper) => tagScores(key, paper));
  const overall = tagsOf(key).map((tag, at) => {
    let points = 0;
    let max = 0;
    let unresolved = 0;
    for (const scores of perPaper) {
      const entry = scores[at];
      if (entry === undefined) continue;
      points += entry.points;
      max += entry.max;
      unresolved += entry.unresolved;
    }
    const questions = perPaper[0]?.[at]?.questions ?? [];
    return { tag, questions, points, max, share: max === 0 ? null : points / max, unresolved };
  });
  return { overall, perPaper, papers: papers.length };
}
