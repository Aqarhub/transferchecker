// Stacks bubble grid fields, such as a student id, into one column of frames.
//
// Since version 5 the stack lives under the tail question column when it fits
// there, and in its own slot beside the columns when it does not, so the same
// planner serves both and only the anchor it is given changes. Each field is
// one grid of character columns, right-aligned so the stack keeps a single
// straight edge.

import { GEOMETRY } from '../paper';
import type { BubbleGridField, BubbleMetrics } from '../spec';
import type { GridFieldColumn, GridFieldLayout, Rect } from '../types';

export interface SidebarPlan {
  readonly fields: readonly GridFieldLayout[];
  readonly widthMm: number;
  readonly heightMm: number;
}

const EMPTY: SidebarPlan = { fields: [], widthMm: 0, heightMm: 0 };

/** The stack's size alone, for fitting decisions before anything is placed. */
export function sidebarSizeMm(
  fields: readonly BubbleGridField[],
  bubble: BubbleMetrics,
): { readonly widthMm: number; readonly heightMm: number } {
  const measured = planSidebar(fields, bubble, 0, 0);
  return { widthMm: measured.widthMm, heightMm: measured.heightMm };
}

/**
 * A one-character field with a handful of symbols, such as a key version,
 * prints its bubbles in a single row rather than a column: the frame is a
 * short strip under the identity grid, which is what lets both fit under the
 * tail question column. Longer symbol sets keep the column, because ten
 * bubbles in a row would be wider than a question column.
 */
const singleRow = (field: BubbleGridField): boolean =>
  field.length === 1 && field.symbols.length <= 6;

export function planSidebar(
  fields: readonly BubbleGridField[],
  bubble: BubbleMetrics,
  rightMm: number,
  topMm: number,
): SidebarPlan {
  if (fields.length === 0) return EMPTY;

  const { radiusMm, pitchXMm, gridPitchYMm } = bubble;
  const pad = GEOMETRY.sidebarPadMm;
  const headroom = pad + GEOMETRY.sidebarWriteBoxMm + 2;
  const frameWidthOf = (field: BubbleGridField): number =>
    singleRow(field)
      ? 2 * pad + 2 * radiusMm + (field.symbols.length - 1) * pitchXMm
      : field.length * pitchXMm + 2 * pad;

  const placed: GridFieldLayout[] = [];
  let cursorYMm = topMm;

  for (const field of fields) {
    const symbols = field.symbols;
    const frameWidthMm = frameWidthOf(field);
    const frameLeftMm = rightMm - frameWidthMm;
    const frameTopMm = cursorYMm + GEOMETRY.sidebarLabelMm;

    if (singleRow(field)) {
      // One row of bubbles, no write boxes: nobody handwrites a key version.
      const frameHeightMm = 2 * pad + 2 * radiusMm;
      placed.push({
        id: field.id,
        label: field.label,
        labelAnchor: { xMm: frameLeftMm + pad, yMm: cursorYMm + GEOMETRY.sidebarLabelMm - 1.5 },
        frame: { xMm: frameLeftMm, yMm: frameTopMm, wMm: frameWidthMm, hMm: frameHeightMm },
        writeBoxes: [],
        columns: [
          {
            index: 0,
            bubbles: symbols.map((symbol, at) => ({
              cxMm: frameLeftMm + pad + radiusMm + at * pitchXMm,
              cyMm: frameTopMm + pad + radiusMm,
              rMm: radiusMm,
              symbol,
            })),
          },
        ],
      });
      cursorYMm = frameTopMm + frameHeightMm + GEOMETRY.sidebarStackGapMm;
      continue;
    }

    const gridTopMm = frameTopMm + headroom;
    const frameHeightMm = headroom + symbols.length * gridPitchYMm + pad;
    const cellLeftMm = (column: number): number => frameLeftMm + pad + column * pitchXMm;

    const writeBoxes = Array.from({ length: field.length }, (_, column): Rect => ({
      xMm: cellLeftMm(column) + 0.75,
      yMm: frameTopMm + pad,
      wMm: pitchXMm - 1.5,
      hMm: GEOMETRY.sidebarWriteBoxMm,
    }));

    const columns = Array.from({ length: field.length }, (_, column): GridFieldColumn => ({
      index: column,
      bubbles: symbols.map((symbol, row) => ({
        cxMm: cellLeftMm(column) + pitchXMm / 2,
        cyMm: gridTopMm + row * gridPitchYMm + gridPitchYMm / 2,
        rMm: radiusMm,
        symbol,
      })),
    }));

    placed.push({
      id: field.id,
      label: field.label,
      labelAnchor: { xMm: frameLeftMm + pad, yMm: cursorYMm + GEOMETRY.sidebarLabelMm - 1.5 },
      frame: { xMm: frameLeftMm, yMm: frameTopMm, wMm: frameWidthMm, hMm: frameHeightMm },
      writeBoxes,
      columns,
    });

    cursorYMm = frameTopMm + frameHeightMm + GEOMETRY.sidebarStackGapMm;
  }

  const widths = fields.map((field) => frameWidthOf(field));
  return {
    fields: placed,
    widthMm: Math.max(...widths),
    heightMm: cursorYMm - GEOMETRY.sidebarStackGapMm - topMm,
  };
}
