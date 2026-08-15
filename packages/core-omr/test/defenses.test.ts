// The named defenses of docs/FAILURE-MODES.md that live in this package.
//
// The acceptance criteria are in scan.test.ts and acceptance.test.ts. Split
// because docs/CODING-STANDARDS.md caps a file at 300 lines.
//
// Numbered against docs/PLAN.md section 11 and docs/FAILURE-MODES.md section
// 4ب-9. The criteria that need a database, a filesystem audit or a real
// photograph are not here and are named in docs/CORE-OMR.md rather than being
// quietly skipped.

import { describe, expect, it } from 'vitest';
import { layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';
import type { Rect, SheetLayout, SheetSpec } from '@transferchecker/sheet-spec';
import { createGray, sampleAt } from '../src/image/gray';
import type { GrayImage } from '../src/image/gray';
import { MAX_RESIDUAL_RMS_MM } from '../src/measure/timing';
import { scanSheet } from '../src/scan/pipeline';
import type { ScanResult } from '../src/scan/result';
import { messageKeyOf } from '../src/scan/reject';
import { DEFAULT_INK, renderSheet } from '../tools/render';
import type { Ink, PencilMark } from '../tools/render';
import { photograph } from '../tools/photograph';

const TEXT = {
  name: 'Standard 50',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

/** A soft pencil, fully shaded. What the instructions ask a student for. */
const PENCIL = 55;

function sheet(kind: 'quick20' | 'standard50' = 'quick20'): {
  spec: SheetSpec;
  layout: SheetLayout;
} {
  const spec = stockTemplate(kind, TEXT);
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') throw new Error(`layout failed for ${kind}`);
  return { spec, layout: result.layout };
}

/** One filled bubble per question, cycling through the choices. */
function answerEvery(layout: SheetLayout, choices: readonly string[]): PencilMark[] {
  return layout.questionColumns.flatMap((column) =>
    column.rows.map((row) => ({
      groupId: `q:${String(row.question)}`,
      symbol: choices[(row.question - 1) % choices.length] ?? 'A',
      coverage: 0.92,
      value: PENCIL,
    })),
  );
}

const answerOf = (result: ScanResult, question: number): string => {
  if (result.kind !== 'ok') return `rejected:${result.reason.kind}`;
  const outcome = result.sheet.questions.find((entry) => entry.question === question)?.outcome;
  if (outcome === undefined) return 'missing';
  if (outcome.kind === 'answer') return outcome.symbol;
  return outcome.kind;
};

describe('defense د14: an identity grid is never resolved into a plausible number', () => {
  it('reports a partly filled grid as partial, with the blank columns shown', () => {
    const { layout } = sheet();
    const grid = layout.gridFields.find((field) => field.id === 'studentId');
    expect(grid).toBeDefined();
    if (grid === undefined) return;

    // Three of the four digits filled, which is the ordinary way a student
    // half fills an identity grid.
    const marks: PencilMark[] = [0, 1, 3].map((column, index) => ({
      groupId: `f:studentId:${String(column)}`,
      symbol: ['3', '7', '4'][index] ?? '0',
      coverage: 0.9,
      value: PENCIL,
    }));
    const image = renderSheet(layout, { pxPerMm: 10, marks });

    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const field = result.sheet.fields.find((entry) => entry.usage === 'studentId');
    expect(field?.state).toBe('partial');
    expect(field?.text).toBe('37_4');
  });

  it('reports an untouched grid as unset rather than as zero', () => {
    const { layout } = sheet();
    const image = renderSheet(layout, { pxPerMm: 10 });
    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const field = result.sheet.fields.find((entry) => entry.usage === 'studentId');
    expect(field?.state).toBe('unset');
    expect(field?.text).toBe('____');
  });
});

describe('criterion 10: no silent wrong answer under glare', () => {
  it('refuses the frame rather than reading a blinded bubble as blank', () => {
    const { layout } = sheet();
    const marks = answerEvery(layout, ['A', 'B', 'C', 'D']);
    const flat = renderSheet(layout, { pxPerMm: 12, marks });

    // The highlight is placed inside a shaded bubble, which is where it really
    // lands: graphite is partly mirrored, so under a point source the brightest
    // spot on the page ends up in the darkest place on it.
    const target = layout.questionColumns[0]?.rows[5]?.bubbles[1];
    expect(target).toBeDefined();
    if (target === undefined) return;

    const frame = photograph(flat, layout.paper.widthMm, layout.paper.heightMm, {
      width: 1600,
      height: 2560,
      glare: { xMm: target.cxMm, yMm: target.cyMm, rMm: 6, strength: 0.95 },
      seed: 51,
    });

    const result = scanSheet(frame);
    // The only two honest outcomes: a named refusal of the whole frame, or the
    // right letter. A wrong letter or a blank would be the silent wrong grade.
    if (result.kind === 'rejected') {
      expect(result.reason.kind).toBe('glare');
      if (result.reason.kind === 'glare') expect(result.reason.groups).toBeGreaterThan(0);
      return;
    }
    expect(answerOf(result, 6)).toBe('B');
  });
});

describe('criterion 13: the answer survives the disturbance a hand really makes', () => {
  it('is unchanged under tilt, scale, shift and exposure', () => {
    const { layout } = sheet();
    const marks = answerEvery(layout, ['A', 'B', 'C', 'D']);
    const flat = renderSheet(layout, { pxPerMm: 12, marks });

    const base = {
      width: 1600,
      height: 2560,
      yawDeg: 3,
      pitchDeg: 2,
      seed: 61,
    } as const;
    const reference = scanSheet(
      photograph(flat, layout.paper.widthMm, layout.paper.heightMm, base),
    );
    expect(reference.kind).toBe('ok');
    if (reference.kind !== 'ok') return;

    // The numbers defense د13 names, applied where they belong: to the
    // photograph, not to the sampling frame. A tilt of 1.5 degrees is absorbed
    // exactly by the four corner squares, which is the point of having them.
    const disturbances = [
      { rollDeg: 1.5 },
      { rollDeg: -1.5 },
      { fill: 0.86 * 1.02 },
      { fill: 0.86 * 0.98 },
      { exposure: 1.1 },
      { exposure: 0.9 },
    ];

    for (const [index, disturbance] of disturbances.entries()) {
      const result = scanSheet(
        photograph(flat, layout.paper.widthMm, layout.paper.heightMm, { ...base, ...disturbance }),
      );
      const label = `disturbance ${String(index)}`;
      expect(`${label}: ${result.kind}`).toBe(`${label}: ok`);
      if (result.kind !== 'ok') continue;
      expect(`${label}: ${result.sheet.marks}`).toBe(`${label}: ${reference.sheet.marks}`);
      expect(result.sheet.questions.map((entry) => answerOf(result, entry.question))).toEqual(
        reference.sheet.questions.map((entry) => answerOf(reference, entry.question)),
      );
    }
  });
});

describe('defense د9: ink that left its bubble is flagged, not averaged away', () => {
  it('flags an answer whose mark spills outside the bubble', () => {
    const { layout } = sheet();
    const image = renderSheet(layout, {
      pxPerMm: 10,
      marks: [
        // A shading that overruns its bubble, which is what a circled letter or
        // a strike through leaves behind.
        { groupId: 'q:3', symbol: 'B', coverage: 1.35, value: PENCIL },
        { groupId: 'q:4', symbol: 'B', coverage: 0.9, value: PENCIL },
      ],
    });
    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const spilled = result.sheet.questions.find((entry) => entry.question === 3)?.outcome;
    const clean = result.sheet.questions.find((entry) => entry.question === 4)?.outcome;
    expect(spilled?.kind).toBe('answer');
    expect(clean?.kind).toBe('answer');
    if (spilled?.kind !== 'answer' || clean?.kind !== 'answer') return;

    // The letter is still read. What changes is that the sheet says so.
    expect(spilled.symbol).toBe('B');
    expect(spilled.escaped).toBe(true);
    expect(clean.escaped).toBe(false);
    expect(result.sheet.marks[2]).toBe('x');
  });
});

describe('defense د16: the corner squares are measured, not only used', () => {
  it('refuses a frame holding two sheets instead of grading the wrong geometry', () => {
    // Four correspondences fix all eight degrees of freedom, so the corner
    // CENTRES can never disprove themselves: any four points solve perfectly
    // against any other four. What the solve never consumed is the square's own
    // printed size, so pushing 8 mm of ink back through the map is the one
    // independent check available.
    //
    // The frame here is what the 2 up print path puts on a desk: an A4 carrier
    // holding two A5 sheets, eight corner squares, and the detector locks onto
    // the outer four. [measured] The map comes out stretched 2.24 times in x
    // and the 8 mm square reads back as 4.97 mm. Before this gate the sheet got
    // as far as the anchor stage and was refused there, which named the wrong
    // cause: the anchors are missing because the map is wrong, not the reverse.
    const { layout } = sheet();
    const one = renderSheet(layout, { pxPerMm: 8 });
    const carrier = createGray(Math.round(297 * 8), Math.round(210 * 8), 216);
    for (const originMm of [0, 149]) {
      const dx = Math.round(originMm * 8);
      for (let y = 0; y < one.height && y < carrier.height; y += 1) {
        for (let x = 0; x < one.width && dx + x < carrier.width; x += 1) {
          carrier.data[y * carrier.stride + dx + x] = one.data[y * one.stride + x] ?? 216;
        }
      }
    }

    const result = scanSheet(carrier, { perturb: false });
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('not_one_sheet');
    if (result.reason.kind !== 'not_one_sheet') return;
    expect(result.reason.fiducialMm).toBeLessThan(6);
    expect(messageKeyOf(result.reason)).toBe('scan.reject.notOneSheet');
  });

  it('grades a sheet whose whole page was stretched, because that still reads', () => {
    // The other half of د16: a print scale, even an uneven one, carries the
    // furniture with it, so the sheet is still self consistent and still
    // grades. A gate that refused this would be refusing a correct sheet.
    const { layout } = sheet();
    const flat = renderSheet(layout, {
      pxPerMm: 8,
      marks: answerEvery(layout, ['A', 'B', 'C', 'D']),
    });
    const stretch = 1.06;
    const taller = createGray(flat.width, Math.round(flat.height * stretch), 216);
    for (let y = 0; y < taller.height; y += 1) {
      for (let x = 0; x < taller.width; x += 1) {
        taller.data[y * taller.stride + x] = sampleAt(flat, x, y / stretch);
      }
    }

    const clean = scanSheet(flat, { perturb: false });
    const result = scanSheet(taller, { perturb: false });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok' || clean.kind !== 'ok') return;
    expect(result.sheet.marks).toBe(clean.sheet.marks);
  });
});

describe('defense د8: the ink floor is a fraction AND an absolute darkening', () => {
  /** The same sheet printed with weaker and weaker toner. */
  const paletteFor = (inkValue: number): Ink => ({
    ...DEFAULT_INK,
    ink: inkValue,
    bubbleStroke: Math.max(inkValue, DEFAULT_INK.bubbleStroke),
    bubbleLabel: Math.max(inkValue, DEFAULT_INK.bubbleLabel),
    boxStroke: Math.max(inkValue, DEFAULT_INK.boxStroke),
  });

  it('calls the same faint smudge blank however weak the toner is', () => {
    // Eleven grey levels of uniform darkening over one bubble: show through
    // from the back of the page, or toner spatter. It is the same physical ink
    // on every sheet here, and the only thing that changes is the printed
    // contrast it is measured against.
    //
    // [measured] With one floor, a fraction of this sheet's own swing, it was
    // blank at printed contrasts of 196, 96 and 56 and stopped being blank at
    // 40, which the photometry stage still accepts. The same smudge, a
    // different answer, decided by how tired the printer was.
    const { layout } = sheet();
    for (const inkValue of [20, 120, 160, 176]) {
      const contrast = DEFAULT_INK.paper - inkValue;
      const image = renderSheet(layout, {
        pxPerMm: 10,
        ink: paletteFor(inkValue),
        marks: [{ groupId: 'q:3', symbol: 'C', coverage: 1, value: DEFAULT_INK.paper - 11 }],
      });
      const result = scanSheet(image, { perturb: false });
      const label = `contrast ${String(contrast)}`;
      expect(`${label}: ${result.kind}`).toBe(`${label}: ok`);
      if (result.kind !== 'ok') continue;
      expect(`${label}: ${answerOf(result, 3)}`).toBe(`${label}: blank`);
    }
  });

  it('still reads a real pencil on the weakest sheet it accepts', () => {
    // The floor may not buy its safety by refusing answers. [computed] A soft
    // pencil on a sheet whose toner is only 40 levels darker than its paper
    // still darkens the disc by about 36 levels, which is twice the floor.
    const { layout } = sheet();
    const image = renderSheet(layout, {
      pxPerMm: 10,
      ink: paletteFor(176),
      marks: [{ groupId: 'q:3', symbol: 'C', coverage: 0.92, value: DEFAULT_INK.paper - 36 }],
    });
    const result = scanSheet(image, { perturb: false });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(answerOf(result, 3)).toBe('C');
  });
});

describe('defense د12: the timing strip is read, and believed only where it agrees', () => {
  /** Paints over a printed mark, which is what a pen stroke down the margin does. */
  const cover = (image: GrayImage, rect: Rect, pxPerMm: number): void => {
    for (
      let y = Math.round((rect.yMm - 1) * pxPerMm);
      y <= Math.round((rect.yMm + rect.hMm + 1) * pxPerMm);
      y += 1
    ) {
      for (
        let x = Math.round((rect.xMm - 1) * pxPerMm);
        x <= Math.round((rect.xMm + rect.wMm + 1) * pxPerMm);
        x += 1
      ) {
        if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
        image.data[y * image.stride + x] = 216;
      }
    }
  };

  it('grades the sheet with one mark gone, and numbers the rows the same', () => {
    // Acceptance criterion 15 asks for the numbering to survive a fifth of the
    // strip being occluded. Refusing at the first missing mark failed it
    // outright, and a pen line down the left margin is a named failure mode
    // rather than an exotic one, so the row registers from its neighbours.
    const { layout } = sheet();
    const options = { pxPerMm: 10, marks: answerEvery(layout, ['A', 'B', 'C', 'D']) };
    const clean = scanSheet(renderSheet(layout, options));

    const damaged = renderSheet(layout, options);
    const covered = layout.timingMarks[6];
    expect(covered).toBeDefined();
    if (covered === undefined) return;
    cover(damaged, covered, 10);

    const result = scanSheet(damaged);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok' || clean.kind !== 'ok') return;
    // Every letter identical to the undamaged read: nothing renumbered, and
    // the row whose own mark is gone is registered from the rows around it.
    expect(result.sheet.marks).toBe(clean.sheet.marks);
    expect(result.sheet.questions.map((entry) => answerOf(result, entry.question))).toEqual(
      clean.sheet.questions.map((entry) => answerOf(clean, entry.question)),
    );
    // And it says so rather than hiding it.
    expect(result.sheet.quality.rowsFound).toBe(result.sheet.quality.rowsExpected - 1);
  });

  it('refuses by name when too much of the strip is gone', () => {
    const { layout } = sheet();
    const image = renderSheet(layout, {
      pxPerMm: 10,
      marks: answerEvery(layout, ['A', 'B', 'C', 'D']),
    });
    // Three in a row: past what interpolation can bridge without inventing a
    // row, whatever the fraction says.
    for (const row of [3, 4, 5]) {
      const rect = layout.timingMarks[row];
      if (rect === undefined) continue;
      cover(image, rect, 10);
    }

    const result = scanSheet(image);
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('rows_missing');
    if (result.reason.kind !== 'rows_missing') return;
    expect(result.reason.found).toBe(result.reason.expected - 3);
    expect(messageKeyOf(result.reason)).toBe('scan.reject.rowsMissing');
  });

  it('drops a mark printed out of place instead of dragging its row with it', () => {
    // [measured] On `full100` one mark printed 3.0 mm out of place gives an RMS
    // of 0.486 mm, which passed the old single gate of 0.5 mm, and the engine
    // then applied it: that row's sample lattice moved 2.613 mm off its
    // bubbles, which is 1.7 disc radii, and the row came back blank with no
    // warning. A root mean square divides one bad row by the square root of the
    // count, so it cannot see a single bad row at all.
    const { layout } = sheet();
    const options = { pxPerMm: 10, marks: answerEvery(layout, ['A', 'B', 'C', 'D']) };
    const clean = scanSheet(renderSheet(layout, options));

    const misprinted: SheetLayout = {
      ...layout,
      timingMarks: layout.timingMarks.map((rect, row) =>
        row === 4 ? { ...rect, yMm: rect.yMm + 2 } : rect,
      ),
    };
    const result = scanSheet(renderSheet(misprinted, options));

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok' || clean.kind !== 'ok') return;
    expect(result.sheet.marks).toBe(clean.sheet.marks);
    expect(result.sheet.quality.timingResidualMm).toBeLessThan(MAX_RESIDUAL_RMS_MM);
    // TWO rows lost, not one, and that is measured rather than assumed: at this
    // sheet's 12 mm pitch the search window reaches 9 mm, which clears a
    // correctly printed neighbour by 1.05 mm, so a mark displaced by 2 mm puts
    // 0.95 mm of its own body inside the next row's window and drags that
    // centroid 1.750 mm off. Both rows fail the per mark gate and both are
    // dropped. Dropping the pair is the safe answer: neither position is
    // believed, nothing is renumbered, and the letters come back identical.
    expect(result.sheet.quality.rowsFound).toBe(result.sheet.quality.rowsExpected - 2);
  });
});

describe('defense د20: the record keeps what the appeal will ask about', () => {
  it('marks an eraser ghost apart from a clean answer and from a spill', () => {
    const { layout } = sheet();
    const image = renderSheet(layout, {
      pxPerMm: 10,
      marks: [
        // Answered C, with B rubbed out. What an eraser leaves is a rim: the
        // middle comes clean and the edge does not.
        { groupId: 'q:2', symbol: 'C', coverage: 0.9, value: PENCIL },
        { groupId: 'q:2', symbol: 'B', coverage: 0.85, value: 175, erased: true },
        { groupId: 'q:6', symbol: 'C', coverage: 0.9, value: PENCIL },
      ],
    });

    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    // The answer is still C. What changes is that the record says a second
    // bubble carried ink, so an appeal about this question has an answer.
    expect(answerOf(result, 2)).toBe('C');
    expect(answerOf(result, 6)).toBe('C');
    expect(result.sheet.marks[1]).toBe('e');
    expect(result.sheet.marks[5]).toBe('c');
  });
});

describe('a question that asks for several answers is not ambiguity', () => {
  it('reads every marked bubble, and reads none as blank', () => {
    const spec = stockTemplate('quick20', TEXT);
    // The stock templates are all single answer, so this is built by hand: it
    // is the one path in the engine that no stock sheet exercises.
    const many: SheetSpec = {
      ...spec,
      questions: spec.questions.map((question, index) =>
        index < 3 ? { ...question, select: 'many' as const } : question,
      ),
    };
    const planned = layoutSheet(many);
    expect(planned.kind).toBe('ok');
    if (planned.kind !== 'ok') return;
    const layout = planned.layout;

    const image = renderSheet(layout, {
      pxPerMm: 10,
      marks: [
        { groupId: 'q:1', symbol: 'A', coverage: 0.9, value: PENCIL },
        { groupId: 'q:1', symbol: 'C', coverage: 0.9, value: PENCIL },
        { groupId: 'q:2', symbol: 'B', coverage: 0.9, value: PENCIL },
      ],
    });

    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const first = result.sheet.questions.find((entry) => entry.question === 1)?.outcome;
    expect(first?.kind).toBe('multiple');
    if (first?.kind === 'multiple') expect([...first.symbols]).toEqual(['A', 'C']);

    // A single mark on a many question is still an answer, not a failure.
    const second = result.sheet.questions.find((entry) => entry.question === 2)?.outcome;
    expect(second?.kind).toBe('multiple');
    if (second?.kind === 'multiple') expect([...second.symbols]).toEqual(['B']);

    // And an untouched many question is blank, not "none of the above".
    expect(answerOf(result, 3)).toBe('blank');
  });

  it('reads every box ticked as the answer, not as ambiguity', () => {
    // The case a rule list gets wrong by ordering: "every bubble is marked"
    // means ambiguous on a single answer question and means ALL OF THEM on a
    // check all that apply one. The select branch has to run before the
    // ambiguity rules, not after, or a student who correctly ticks everything
    // gets a warning for being right.
    const spec = stockTemplate('quick20', TEXT);
    const many: SheetSpec = {
      ...spec,
      questions: spec.questions.map((question, index) =>
        index < 1 ? { ...question, select: 'many' as const } : question,
      ),
    };
    const planned = layoutSheet(many);
    expect(planned.kind).toBe('ok');
    if (planned.kind !== 'ok') return;
    const layout = planned.layout;

    const image = renderSheet(layout, {
      pxPerMm: 10,
      marks: ['A', 'B', 'C', 'D'].map((symbol) => ({
        groupId: 'q:1',
        symbol,
        coverage: 0.9,
        value: PENCIL,
      })),
    });

    const result = scanSheet(image);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const outcome = result.sheet.questions.find((entry) => entry.question === 1)?.outcome;
    expect(outcome?.kind).toBe('multiple');
    if (outcome?.kind === 'multiple') expect([...outcome.symbols]).toEqual(['A', 'B', 'C', 'D']);
    expect(result.sheet.quality.ambiguous).toBe(0);
  });
});
