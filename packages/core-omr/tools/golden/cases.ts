// The cases themselves.
//
// Each one names the physical thing it models, and each `expect` is a claim
// about paper rather than about code: a curled sheet must be refused, a page
// printed at 96 percent must grade identically, a frame with glare on it must
// be dropped. When a case fails, the first question is which of the two is
// wrong, and the answer is written down either way.

import type { StockTemplate } from '@transferchecker/sheet-spec';
import type { PencilMark } from '../render';
import { answerFraction, framing, identityDigits, paperHeightMm, sheetOf, tonerAt } from './corpus';
import type { GoldenCase } from './corpus';

const TEMPLATES: readonly StockTemplate[] = ['quick20', 'standard50', 'full100'];

/**
 * The answered fraction sweep, which is the axis no other test covers.
 *
 * Any statistic taken over the whole page dies here and nowhere else: a rule
 * that normalises against the darkest bubble on the sheet, or against a page
 * quantile, reads perfectly at 100 percent answered and invents answers at 2
 * percent. [carried] The cliffs land at 22 of 100, 10 of 50 and 2 of 20.
 */
function cleanCases(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (const template of TEMPLATES) {
    const { layout } = sheetOf(template);
    for (const fraction of [0, 0.02, 0.05, 0.1, 0.2, 0.5, 1]) {
      const marks = [
        ...answerFraction(layout, fraction, 7 + Math.round(fraction * 100)),
        ...identityDigits(['3', '7', '0', '4']),
      ];
      cases.push({
        id: `clean/${template}/answered-${String(Math.round(fraction * 100))}`,
        stratum: 'clean',
        template,
        marks,
        expect: 'graded',
        chars: { only: ['b', 'c'] },
        why: `${String(Math.round(fraction * 100))} percent of the questions answered`,
      });
    }
  }
  return cases;
}

/** A phone at the distances and angles a hand really holds it. */
function framingCases(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (const template of ['quick20', 'standard50'] as const) {
    const { layout } = sheetOf(template);
    const marks = [...answerFraction(layout, 0.5, 31), ...identityDigits(['1', '2', '8', '9'])];
    const frames = [
      { id: '1080p', photo: framing(1080, 1920) },
      { id: '1440p', photo: framing(1440, 2560) },
      { id: '1920p', photo: framing(1920, 3413) },
      { id: '1440p-far', photo: framing(1440, 2560, { fill: 0.62 }) },
      // [measured] The steepest frame that still reads. At 12 degrees of yaw
      // with 9 of pitch the code stops decoding, on this template at both 1440p
      // and 1920p, so this is the boundary rather than a guess at one.
      { id: '1440p-steep', photo: framing(1440, 2560, { yawDeg: 10, pitchDeg: 7, rollDeg: 5 }) },
    ];
    for (const frame of frames) {
      cases.push({
        id: `framing/${template}/${frame.id}`,
        stratum: 'framing',
        template,
        marks,
        pxPerMm: 12,
        photo: frame.photo,
        expect: 'graded',
        why: `photographed at ${frame.id}`,
      });
    }
    // The angle a sheet survives is a function of its SIZE, not of the angle
    // alone, because what fails first is the resolution at the far edge.
    // [measured] on this corpus at 1440p: A4 reads to 10 degrees of yaw and
    // refuses at 12; A5 reads to 18 and refuses at 22. So the boundary case is
    // placed per template rather than shared, and the smaller paper's tolerance
    // is a real property worth keeping visible.
    const beyond =
      template === 'quick20'
        ? { yawDeg: 22, pitchDeg: 15, rollDeg: 10 }
        : { yawDeg: 14, pitchDeg: 10, rollDeg: 7 };
    cases.push({
      id: `framing/${template}/beyond-the-angle`,
      stratum: 'framing',
      template,
      marks,
      pxPerMm: 12,
      photo: framing(1440, 2560, beyond),
      expect: 'too_steep',
      why: 'past the angle this paper survives, where the honest answer is to hold the phone flatter',
    });
  }
  return cases;
}

/** Where the light is, which is the first named complaint in the field. */
function lightingCases(): GoldenCase[] {
  const template = 'standard50' as const;
  const { layout } = sheetOf(template);
  const marks = [...answerFraction(layout, 0.4, 55), ...identityDigits(['9', '0', '4', '2'])];
  const heightMm = paperHeightMm(template);
  const base = { stratum: 'lighting', template, marks, pxPerMm: 12 } as const;

  return [
    {
      ...base,
      id: 'lighting/shadow-across-the-page',
      photo: framing(1440, 2560, { shadow: { fromMm: 0, toMm: heightMm, strength: 0.4 } }),
      expect: 'graded',
      why: 'a hand or a head between the lamp and the paper',
    },
    {
      ...base,
      id: 'lighting/under-exposed',
      photo: framing(1440, 2560, { exposure: 0.75 }),
      expect: 'graded',
      why: 'the camera metered for a bright room',
    },
    {
      ...base,
      id: 'lighting/over-exposed',
      photo: framing(1440, 2560, { exposure: 1.2 }),
      expect: 'graded',
      why: 'the camera metered for the dark desk around the page',
    },
    {
      ...base,
      id: 'lighting/glare-on-a-shaded-bubble',
      photo: framing(1440, 2560, {
        glare: {
          xMm: layout.questionColumns[0]?.rows[4]?.bubbles[1]?.cxMm ?? 40,
          yMm: layout.questionColumns[0]?.rows[4]?.bubbles[1]?.cyMm ?? 80,
          rMm: 7,
          strength: 0.95,
        },
      }),
      expect: 'glare',
      why: 'a point source reflected off graphite, which destroys the reading',
    },
  ];
}

/** What the printer did, which is where the absolute ink floor earns its place. */
function printingCases(): GoldenCase[] {
  const template = 'standard50' as const;
  const { layout } = sheetOf(template);
  const marks = [...answerFraction(layout, 0.3, 77), ...identityDigits(['5', '5', '1', '1'])];
  const base = { stratum: 'printing', template, marks } as const;

  return [
    {
      ...base,
      id: 'printing/toner-96',
      chars: { only: ['b', 'c'] },
      ink: tonerAt(120),
      expect: 'graded',
      why: 'a tired cartridge',
    },
    {
      ...base,
      id: 'printing/toner-56',
      chars: { only: ['b', 'c'] },
      ink: tonerAt(160),
      expect: 'graded',
      why: 'a third generation photocopy',
    },
    {
      ...base,
      id: 'printing/toner-40',
      chars: { only: ['b', 'c'] },
      ink: tonerAt(176),
      expect: 'graded',
      why: 'the weakest page the engine accepts at all',
    },
    {
      ...base,
      id: 'printing/speck-on-weak-toner',
      ink: tonerAt(176),
      // Eleven grey levels of show through over one bubble of an unanswered
      // question. On a healthy page that is nothing; at this contrast it is
      // 0.28 of the paper to toner swing, which is exactly why the second floor
      // is counted in grey levels and not in ink units.
      marks: [
        ...marks.filter((mark) => mark.groupId !== 'q:2'),
        { groupId: 'q:2', symbol: 'C', coverage: 1, value: 205 },
      ],
      chars: { only: ['b', 'c'] },
      expect: 'graded',
      why: 'a speck of show through on the weakest page the engine accepts',
    },
    {
      ...base,
      id: 'printing/fit-to-page-96',
      chars: { only: ['b', 'c'] },
      printScale: 0.96,
      expect: 'graded',
      why: 'Fit to page shrank the sheet',
    },
    {
      ...base,
      id: 'printing/scaled-104',
      chars: { only: ['b', 'c'] },
      printScale: 1.04,
      expect: 'graded',
      why: 'printed a little large',
    },
  ];
}

/**
 * What a hand leaves on paper, all on one sheet so that one scan produces many
 * question level records rather than one.
 */
function markCases(): GoldenCase[] {
  const template = 'standard50' as const;
  const { layout } = sheetOf(template);
  const rows = layout.questionColumns.flatMap((column) => column.rows);
  const symbolOf = (question: number, index: number): string =>
    rows.find((row) => row.question === question)?.bubbles[index]?.symbol ?? 'A';

  // The hand crafted questions replace their ordinary answers rather than
  // joining them, so each one says one thing.
  const special = new Set([3, 5, 7, 9, 11, 13]);
  const marks: PencilMark[] = [
    // Ordinary answers, which is what most of the sheet must be.
    ...answerFraction(layout, 0.4, 91).filter(
      (mark) => !special.has(Number(mark.groupId.slice(2))),
    ),
    // A hard pencil, which leaves half the graphite of a soft one.
    { groupId: 'q:3', symbol: symbolOf(3, 2), coverage: 0.9, value: 120 },
    // A quick tick rather than a shading: a quarter of the bubble.
    { groupId: 'q:5', symbol: symbolOf(5, 1), coverage: 0.35, value: 60 },
    // Shaded off centre, which is what a fast hand does.
    {
      groupId: 'q:7',
      symbol: symbolOf(7, 3),
      coverage: 0.85,
      value: 55,
      offsetXMm: 0.6,
      offsetYMm: -0.4,
    },
    // Rubbed out and answered again: the ghost may raise a flag and may never
    // be the answer.
    { groupId: 'q:9', symbol: symbolOf(9, 0), coverage: 0.8, value: 185, erased: true },
    { groupId: 'q:9', symbol: symbolOf(9, 2), coverage: 0.9, value: 55 },
    // Two answers, which is a question for the teacher and never a letter.
    { groupId: 'q:11', symbol: symbolOf(11, 1), coverage: 0.9, value: 55 },
    { groupId: 'q:11', symbol: symbolOf(11, 3), coverage: 0.88, value: 55 },
    // A mark that overran its bubble: a circle, a cross, rough work.
    { groupId: 'q:13', symbol: symbolOf(13, 2), coverage: 1.35, value: 55 },
    ...identityDigits(['4', '4', '6', '0']),
  ];

  return [
    {
      id: 'marks/a-real-hand-flat',
      stratum: 'marks',
      template,
      marks,
      expect: 'graded',
      // The eraser on q9 and the spill on q13 are the two the record has to
      // keep: د20 exists so that an appeal can ask which of the two happened.
      chars: { atLeast: ['e', 'x'] },
      why: 'hard pencil, a tick, an off centre shading, an erasure, a double and a spill',
    },
    {
      id: 'marks/a-real-hand-photographed',
      stratum: 'marks',
      template,
      marks,
      pxPerMm: 12,
      photo: framing(1440, 2560),
      expect: 'graded',
      chars: { atLeast: ['e', 'x'] },
      why: 'the same hand, through a camera',
    },
  ];
}

/**
 * Three cases that exist because a mutant survived, and each one names the
 * mutant it was written to kill.
 *
 * The mutation catalogue in `mutants.ts` is the only thing in this repository
 * that can say whether the sweep has any power at all, and its surviving list
 * is a to do list written in the corpus's own terms: a threshold nothing
 * distinguishes is a threshold nobody is testing. All three sheets are drawn on
 * the smaller paper, because the catalogue runs thirteen sweeps over the probe
 * set and A5 halves the work.
 *
 * The ink values are [measured] rather than chosen: a mark is drawn as a
 * coverage and a grey value, and what the engine sees is a mean over the inner
 * disc, so every rung below was found by rendering it and reading the decision
 * margin back. An empty bubble on these sheets reads 0.062, which is the
 * printed letter inside it and not noise.
 */
function calibrationCases(): GoldenCase[] {
  const template = 'quick20' as const;
  const { layout } = sheetOf(template);
  const rows = layout.questionColumns.flatMap((column) => column.rows);
  const symbolOf = (question: number, index: number): string =>
    rows.find((row) => row.question === question)?.bubbles[index]?.symbol ?? 'A';

  // The ladder, climbing the gap between the ink floor at 0.25 and the 0.45 a
  // mutated floor sits at. [measured] each pair renders to the ink beside it and
  // to the decision margin after it, on a sheet whose printed contrast is 196.
  //
  //   coverage 0.65 value 150 -> ink 0.257, margin 0.007, flagged uncertain
  //   coverage 0.70 value 150 -> ink 0.299, margin 0.049, flagged uncertain
  //   coverage 0.62 value 120 -> ink 0.341, margin 0.091, answered outright
  //   coverage 0.70 value 130 -> ink 0.390, margin 0.113, answered outright
  //   coverage 0.60 value 090 -> ink 0.420, margin 0.127, answered outright
  //
  // So the page prints the doubt boundary as well as the floor: it sits between
  // 0.299 and 0.341 of ink, which is a number no document had and no case could
  // have produced, because nothing in the corpus was drawn in this band at all.
  const RUNGS: readonly { readonly coverage: number; readonly value: number }[] = [
    { coverage: 0.65, value: 150 },
    { coverage: 0.7, value: 150 },
    { coverage: 0.62, value: 120 },
    { coverage: 0.7, value: 130 },
    { coverage: 0.6, value: 90 },
  ];

  const ladder: PencilMark[] = RUNGS.map((rung, index) => ({
    groupId: `q:${String(index + 1)}`,
    symbol: symbolOf(index + 1, 1),
    coverage: rung.coverage,
    value: rung.value,
  }));

  // A sheet answered normally, with ONE mark put inside the uncertainty band so
  // that a single doubt has to survive among confident neighbours. [measured]
  // ink 0.299 against a floor of 0.25, so the mark is unambiguously there and
  // the only question is whether the engine says how close it came.
  const doubted: PencilMark[] = [
    ...answerFraction(layout, 1, 23).filter((mark) => mark.groupId !== 'q:4'),
    { groupId: 'q:4', symbol: symbolOf(4, 2), coverage: 0.7, value: 150 },
  ];

  // [measured] ink 0.820 against 0.492 is a ratio of 0.60: above the 0.45 the
  // rule refuses at, and well under the 0.95 a blinded runner up rule accepts.
  // The existing double on the marks sheet is 0.9 against 0.88, which no runner
  // up ratio under 0.98 can tell apart, so it could never have caught this.
  const pair: PencilMark[] = [
    ...answerFraction(layout, 0.5, 29).filter((mark) => mark.groupId !== 'q:2'),
    { groupId: 'q:2', symbol: symbolOf(2, 1), coverage: 0.8, value: 55 },
    { groupId: 'q:2', symbol: symbolOf(2, 3), coverage: 0.65, value: 90 },
  ];

  return [
    {
      id: 'marks/strength-ladder',
      stratum: 'marks',
      template,
      marks: ladder,
      expect: 'graded',
      // These five are the whole sheet, so that a floor moved to 0.45 leaves
      // NOTHING on it: every rung is above 0.25 and every rung is below 0.45,
      // which is what makes this page a measurement of where the floor is
      // rather than of whether one exists. [measured] under that floor all five
      // come back as an eraser trace, so the page carries no `c` and no `u` at
      // all, and this line is what says so.
      chars: { only: ['c', 'u', 'b'], atLeast: ['c', 'u'] },
      why: 'five shadings climbing the gap between the ink floor and twice it, which is where no case sat',
    },
    {
      id: 'marks/a-mark-that-must-be-doubted',
      stratum: 'marks',
      template,
      marks: doubted,
      expect: 'graded',
      // The claim is the flag itself. A count based metric cannot make it,
      // because the engine reads this mark correctly either way: what changes
      // when the uncertainty band closes is only whether the teacher is told.
      chars: { only: ['c', 'u'], atLeast: ['u'] },
      why: 'one mark barely over the floor on a sheet that is otherwise certain, where the honest answer is a flag',
    },
    {
      id: 'marks/strong-and-medium-pair',
      stratum: 'marks',
      template,
      marks: pair,
      expect: 'graded',
      // Two shadings a student really leaves when they change their mind and do
      // not rub out: one full, one half hearted. There is no answer in it, and
      // the only wrong outcome is a confident letter.
      chars: { only: ['c', 'b', 'd'], atLeast: ['d'] },
      why: 'a full shading beside a half hearted one, which is a question for the teacher and never a letter',
    },
  ];
}

/** What happens to the paper between the printer and the phone. */
function geometryCases(): GoldenCase[] {
  const template = 'standard50' as const;
  const { layout } = sheetOf(template);
  const marks = [...answerFraction(layout, 0.4, 13), ...identityDigits(['7', '7', '8', '8'])];
  const base = { stratum: 'geometry', template, marks } as const;

  return [
    { ...base, id: 'geometry/flat', expect: 'graded', why: 'the control for this stratum' },
    {
      ...base,
      id: 'geometry/curl-0.3mm',
      bendMm: 0.3,
      expect: 'graded',
      why: 'a curl inside the registration budget',
    },
    {
      ...base,
      id: 'geometry/curl-1.5mm',
      bendMm: 1.5,
      expect: 'sheet_not_flat',
      why: 'a curl that moves the middle of the page',
    },
    {
      ...base,
      id: 'geometry/curl-5.6mm',
      bendMm: 5.6,
      expect: 'anchors_missing',
      why: 'a whole bubble pitch of curl, the silent wrong grade',
    },
    {
      ...base,
      id: 'geometry/one-mark-covered',
      coverRows: [6],
      expect: 'graded',
      why: 'a pen line over one timing mark',
    },
    {
      ...base,
      id: 'geometry/three-marks-covered',
      coverRows: [6, 7, 8],
      expect: 'rows_missing',
      why: 'more of the strip than interpolation may bridge',
    },
    {
      ...base,
      id: 'geometry/two-sheets-in-frame',
      twoUp: true,
      expect: 'not_one_sheet',
      why: 'the 2 up print path, photographed whole',
    },
  ];
}

/** Every case, in a stable order so a report diff is readable. */
export function allCases(): GoldenCase[] {
  return [
    ...cleanCases(),
    ...framingCases(),
    ...lightingCases(),
    ...printingCases(),
    ...markCases(),
    ...calibrationCases(),
    ...geometryCases(),
  ];
}

/**
 * The subset the default test command runs: flat pages only, and the two
 * smaller templates, which is [measured] 23 of 55 cases and 6.6 seconds of the
 * sweep's 21.4. The rest is a command a person runs, and a job CI runs on its
 * own schedule.
 */
export function quickCases(): GoldenCase[] {
  return allCases().filter(
    (item) =>
      item.photo === undefined &&
      item.template !== 'full100' &&
      (item.stratum !== 'clean' ||
        item.id.endsWith('-0') ||
        item.id.endsWith('-5') ||
        item.id.endsWith('-100')),
  );
}
