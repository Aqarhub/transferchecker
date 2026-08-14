// Choosing the paper a sheet is printed on.
//
// A sheet takes the smallest size its contents fit on. Printing twenty
// questions on a full page leaves the bottom half blank, wastes paper, and
// looks like a mistake, so the size follows the exam rather than the exam being
// stretched to a fixed size.

import { PAPER_FAMILIES } from './paper';
import type { PaperFamily, PaperName } from './paper';
import { SheetSpecSchema } from './spec';
import type { SheetSpecInput } from './spec';
import { layoutSheet } from './layout/index';

/** How much of the page below the header the questions actually occupy. */
export interface PaperChoice {
  readonly paper: PaperName;
  /** Zero to one. Low means the sheet is mostly blank and looks unfinished. */
  readonly fill: number;
}

type WithoutPaper = Omit<SheetSpecInput, 'paper'>;

function measure(input: WithoutPaper, paper: PaperName): PaperChoice | null {
  const parsed = SheetSpecSchema.safeParse({ ...input, paper });
  if (!parsed.success) return null;

  const result = layoutSheet(parsed.data);
  if (result.kind !== 'ok') return null;

  const { layout } = result;
  const rows = layout.questionColumns[0]?.rows ?? [];
  const first = rows[0];
  const last = rows.at(-1);
  if (first === undefined || last === undefined) return null;

  // Measured from the top of the grid to the print warning, which is the space
  // the questions had to fill.
  const gridTopMm = first.numberAnchor.yMm;
  const gridBottomMm = last.numberAnchor.yMm;
  const availableMm = layout.warningAnchor.yMm - gridTopMm;
  return {
    paper,
    fill: availableMm <= 0 ? 1 : Math.min(1, (gridBottomMm - gridTopMm) / availableMm),
  };
}

/**
 * The smallest paper in the family that holds this sheet, or null when none
 * does. Null is a real answer: two hundred questions with a hand typed alphabet
 * fit nothing, and the caller shows that rather than printing something wrong.
 */
export function smallestPaper(input: WithoutPaper, family: PaperFamily = 'A'): PaperChoice | null {
  for (const paper of PAPER_FAMILIES[family]) {
    const choice = measure(input, paper);
    if (choice !== null) return choice;
  }
  return null;
}
