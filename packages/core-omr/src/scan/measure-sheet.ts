// One full measurement pass over a sheet, for one map between paper and frame.
//
// Split out from the pipeline because it is run more than once: the base pass,
// then once per member of the deterministic perturbation set (defense د13). The
// stages before it, finding the sheet and reading its code, are not repeated,
// because a nudge of a fraction of a pixel cannot change what the code says.

import type { Bubble, SheetLayout, SheetSpec } from '@transferchecker/sheet-spec';
import { decideGroup } from '../decide/group';
import type { GroupOutcome } from '../decide/group';
import type { Thresholds } from '../decide/thresholds';
import type { Frame } from '../geometry/frame';
import type { GrayImage } from '../image/gray';
import { measureBubble } from '../measure/bubble';
import type { LabelSide } from '../measure/bubble';
import type { PhotometricField } from '../measure/photometry';
import { ringFor } from '../measure/ring';
import type { Ring } from '../measure/ring';
import { rowCorrectionMm } from '../measure/timing';
import type { RowMark } from '../measure/timing';

export interface GroupResult {
  readonly id: string;
  readonly outcome: GroupOutcome;
  /** Where the group sits, so a rejection can point at a quarter of the sheet. */
  readonly xMm: number;
  readonly yMm: number;
}

export interface SheetPass {
  readonly questions: readonly GroupResult[];
  readonly fields: readonly { readonly id: string; readonly columns: readonly GroupResult[] }[];
}

function readGroup(
  image: GrayImage,
  frame: Frame,
  field: PhotometricField,
  marks: readonly RowMark[],
  id: string,
  bubbles: readonly Bubble[],
  many: boolean,
  labelSide: LabelSide,
  thresholds: Thresholds,
  ring: Ring,
  grid = false,
): GroupResult {
  const readings = bubbles.map((bubble) =>
    measureBubble(
      image,
      frame,
      field,
      bubble,
      rowCorrectionMm(marks, bubble.cyMm),
      labelSide,
      ring,
    ),
  );
  const first = bubbles[0];
  return {
    id,
    outcome: decideGroup(
      { symbols: bubbles.map((bubble) => bubble.symbol), readings, many, grid },
      thresholds,
    ),
    xMm: first?.cxMm ?? 0,
    yMm: first?.cyMm ?? 0,
  };
}

export function measureSheet(
  image: GrayImage,
  frame: Frame,
  field: PhotometricField,
  marks: readonly RowMark[],
  layout: SheetLayout,
  spec: SheetSpec,
  thresholds: Thresholds,
): SheetPass {
  // One ring geometry for the whole sheet: every bubble on it shares a radius
  // and the closest pitch is what the ring has to clear.
  const ring = ringFor(
    spec.bubble.radiusMm,
    Math.min(spec.bubble.pitchXMm, spec.bubble.pitchYMm, spec.bubble.gridPitchYMm),
  );

  const questions: GroupResult[] = [];
  for (const column of layout.questionColumns) {
    for (const row of column.rows) {
      const question = spec.questions[row.question - 1];
      questions.push(
        readGroup(
          image,
          frame,
          field,
          marks,
          `q:${String(row.question)}`,
          row.bubbles,
          question?.select === 'many',
          // A choice letter printed beside its bubble sits to its left, so that
          // side of the escape ring holds printed ink and is not measured.
          question?.placement === 'external' ? 'left' : 'none',
          thresholds,
          ring,
        ),
      );
    }
  }
  questions.sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));

  const fields = layout.gridFields.map((grid) => ({
    id: grid.id,
    columns: grid.columns.map((gridColumn) =>
      readGroup(
        image,
        frame,
        field,
        marks,
        `f:${grid.id}:${String(gridColumn.index)}`,
        gridColumn.bubbles,
        // Never multiple choice. `many` would make two marks the ANSWER, which
        // is the opposite of what a digit column means.
        false,
        'none',
        thresholds,
        ring,
        // And د14 proper: two marks over the floor are ambiguous whatever the
        // ratio between them says. The old comment claimed this rule while
        // passing only `many: false`, which is strictly weaker: it stopped two
        // marks becoming two digits, and let a heavy one beside a faint one
        // become a confident single digit.
        true,
      ),
    ),
  }));

  return { questions, fields };
}

/** Every group of a pass, questions and grid columns alike, in a stable order. */
export function groupsOf(pass: SheetPass): readonly GroupResult[] {
  return [...pass.questions, ...pass.fields.flatMap((field) => field.columns)];
}

/**
 * What an outcome has to agree on between two readings of one sheet.
 *
 * Acceptance criterion 12 is explicit that the totals agreeing is not enough: a
 * warning that appears and disappears is irreproducibility wearing a hat, and it
 * is worse for trust than a wrong total because the teacher watches it happen.
 * So the identity compared here carries the flags, not only the letter.
 */
export function identityOf(outcome: GroupOutcome): string {
  switch (outcome.kind) {
    case 'blank':
      return `blank:${outcome.trace ? 'trace' : 'clean'}`;
    case 'answer':
      return `answer:${outcome.symbol}:${outcome.uncertain ? 'u' : ''}${outcome.escaped ? 'e' : ''}${outcome.trace ? 't' : ''}`;
    case 'multiple':
      return `multiple:${outcome.symbols.join('')}:${outcome.uncertain ? 'u' : ''}`;
    case 'ambiguous':
      return `ambiguous:${outcome.reason}`;
    case 'unmeasurable':
      return 'unmeasurable';
  }
}
