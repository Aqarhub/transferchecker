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
      ink: tonerAt(120),
      expect: 'graded',
      why: 'a tired cartridge',
    },
    {
      ...base,
      id: 'printing/toner-56',
      ink: tonerAt(160),
      expect: 'graded',
      why: 'a third generation photocopy',
    },
    {
      ...base,
      id: 'printing/toner-40',
      ink: tonerAt(176),
      expect: 'graded',
      why: 'the weakest page the engine accepts at all',
    },
    {
      ...base,
      id: 'printing/fit-to-page-96',
      printScale: 0.96,
      expect: 'graded',
      why: 'Fit to page shrank the sheet',
    },
    {
      ...base,
      id: 'printing/scaled-104',
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
      why: 'the same hand, through a camera',
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
    ...geometryCases(),
  ];
}

/**
 * The subset the default test command runs: flat pages only, and the two
 * smaller templates, which is [measured] about a fifth of the sweep's time.
 * The rest is a command a person runs, and a job CI runs on its own schedule.
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
