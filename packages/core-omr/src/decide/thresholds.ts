// Every number the engine decides on, in one place, each with where it came
// from.
//
// They are gathered here rather than spread through the code for two reasons.
// The golden set is going to move most of them, and a number that has to be
// hunted for is a number that gets tuned twice in two places. And a threshold
// whose provenance is not written next to it becomes folklore within a month.
//
// Provenance is marked the way docs/FAILURE-MODES.md marks it: [measured] means
// it was produced by running code in this repository, [reasoned] means it is an
// argument with no measurement behind it yet. Nothing here is [sourced], because
// no vendor publishes these.

export interface Thresholds {
  /**
   * The absolute ink floor. Below this a group holds no answer at all.
   *
   * This is the fix for the first proven defect, and it is the single most
   * important number in the package. The plan's rule divided each bubble by the
   * brightest bubble in its own question, so an untouched question containing
   * 4 percent dust normalised to 1.00 and returned a confident letter. No
   * ratio is computed here until the darkest bubble clears this floor, and the
   * floor is measured on the black to white scale the sheet's own printed
   * furniture declares (defense د7), not on raw grey values, which is what
   * makes an absolute number safe under a shadow.
   *
   * [measured] On synthetic sheets the separation is wide: paper at 248 against
   * printed ink at 18 puts a soft pencil near 0.90 ink and a hard pencil near
   * 0.56, while dust and sensor noise land under 0.06. 0.25 sits between them.
   * [reasoned] The real value is a golden set question, and it is expected to
   * move. What may not move is the existence of the floor.
   */
  readonly minInk: number;

  /**
   * The second floor, in GREY LEVELS rather than in ink units.
   *
   * `minInk` is a fraction of this sheet's own paper to toner swing, and that
   * swing is not a constant: `photometryOf` accepts a frame down to 40 levels
   * of separation, so on a third generation photocopy 0.25 ink is an absolute
   * darkening of only ten grey levels. [measured] Ten levels is what show
   * through from the back of the page, a fly speck or toner spatter puts on a
   * bubble: rendering a uniform eleven level smudge over one bubble of a
   * quick20 sheet returns `blank` at every printed contrast from 196 down to
   * 56, and at 40 it stops being blank. The same physical smudge, the same
   * absolute ink, a different answer, decided by how tired the printer was.
   *
   * Eighteen levels is the floor that closes it: [computed] a soft pencil on
   * that same weak sheet reads 0.9 x 40 = 36 levels and passes with room, while
   * no speck reaches 18 whatever the toner does. The two floors are checked
   * together and the stricter one wins, which on any healthy sheet is `minInk`.
   * [reasoned] The exact level is a golden set question. Its existence is not.
   */
  readonly minAbsDark: number;

  /**
   * The relative rule, reached only after the floor has been cleared: no other
   * bubble may hold more than this share of the darkest one. Two marks that
   * close are not an answer, they are a question for the teacher.
   * [reasoned] Carried over from PLAN.md section 4.
   *
   * PLAN.md's rule also carried an `answerRatio` of 0.65, and it is not here:
   * [measured] setting it to 0.01 or to 0.99 gave byte identical readings on
   * every case of the sweep, because the winner's own ratio is 1.00 by
   * construction and no file in `src` ever read the number. A documented
   * threshold nobody reads is folklore that a sweep then reports as robust, so
   * it is deleted rather than left to be tuned by someone who believes it.
   */
  readonly runnerUpRatio: number;

  /**
   * Decision margin under which a bubble is flagged uncertain even though the
   * rule decided it. Defense د13: a paper whose margins are all wide is
   * deterministic by construction, and no number of frames makes a narrow one
   * deterministic.
   * [reasoned] One third of the floor, so a mark at 0.33 ink is called for
   * review rather than being silently taken as an answer.
   */
  readonly uncertainMargin: number;

  /**
   * Fraction of a bubble's disc that may read at the locally expected paper
   * white before the bubble is unmeasurable. Defense د10: glare is not light on
   * top of a reading, it is the reading being destroyed, so it can never resolve
   * to "blank" and it rejects the frame rather than the question.
   * [reasoned] A tenth of the disc, from د10.
   */
  readonly maxSaturation: number;

  /**
   * Ink in the escape ring above which the mark left its bubble. Defense د9:
   * the signature of a circled letter, a cross or rough work.
   * [reasoned] Well above the ring's own noise on a clean sheet, which measures
   * near zero because the ring holds no printed ink by construction.
   */
  readonly escapeInk: number;

  /**
   * A bubble under the floor but above this carries a trace: an eraser ghost,
   * or a mark so light the student may have meant to remove it. It never
   * becomes an answer, it becomes a flag.
   * [reasoned] Above sensor noise and paper texture, below the floor.
   */
  readonly traceInk: number;

  /** For a question that asks for several answers, each bubble decides alone. */
  readonly manyOn: number;
  readonly manyOff: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  minInk: 0.25,
  minAbsDark: 18,
  runnerUpRatio: 0.45,
  uncertainMargin: 0.08,
  maxSaturation: 0.1,
  escapeInk: 0.18,
  traceInk: 0.1,
  manyOn: 0.45,
  manyOff: 0.25,
};
