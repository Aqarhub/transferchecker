// Stacks bubble grid fields, such as a student id, down the right side of the
// sheet. Each field is one grid of character columns and is right-aligned so
// the sidebar keeps a single straight edge.

import { GEOMETRY } from '../paper';
import type { BubbleGridField, BubbleMetrics } from '../spec';
import type { GridFieldColumn, GridFieldLayout, Rect } from '../types';

export interface SidebarPlan {
  readonly fields: readonly GridFieldLayout[];
  readonly widthMm: number;
  readonly heightMm: number;
}

const EMPTY: SidebarPlan = { fields: [], widthMm: 0, heightMm: 0 };

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
  const frameWidthOf = (length: number): number => length * pitchXMm + 2 * pad;

  const placed: GridFieldLayout[] = [];
  let cursorYMm = topMm;

  for (const field of fields) {
    const symbols = field.symbols;
    const frameWidthMm = frameWidthOf(field.length);
    const frameLeftMm = rightMm - frameWidthMm;
    const frameTopMm = cursorYMm + GEOMETRY.sidebarLabelMm;
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

  const widths = fields.map((field) => frameWidthOf(field.length));
  return {
    fields: placed,
    widthMm: Math.max(...widths),
    heightMm: cursorYMm - GEOMETRY.sidebarStackGapMm - topMm,
  };
}
