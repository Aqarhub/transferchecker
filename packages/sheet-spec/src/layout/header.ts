// Flows handwriting fields across the header band, wrapping to a new row when
// the next field would cross the right edge.

import { FIELD_WIDTH_MM, GEOMETRY } from '../paper';
import type { WrittenBoxField } from '../spec';
import type { WrittenBoxLayout } from '../types';

export interface HeaderPlan {
  readonly fields: readonly WrittenBoxLayout[];
  readonly heightMm: number;
}

const ROW_HEIGHT_MM = GEOMETRY.headerLabelMm + GEOMETRY.writtenBoxHeightMm;

export function planHeader(
  fields: readonly WrittenBoxField[],
  leftMm: number,
  rightMm: number,
  topMm: number,
): HeaderPlan {
  if (fields.length === 0) {
    return { fields: [], heightMm: 0 };
  }

  const availableMm = Math.max(rightMm - leftMm, 0);
  const placed: WrittenBoxLayout[] = [];
  let cursorXMm = leftMm;
  let rowTopMm = topMm;
  let rows = 1;

  for (const field of fields) {
    // A field wider than the band is clamped rather than allowed to overflow,
    // since the header can always be made to fit by shrinking a box.
    const widthMm = Math.min(FIELD_WIDTH_MM[field.width], availableMm);
    const startsRow = cursorXMm === leftMm;
    if (!startsRow && cursorXMm + widthMm > rightMm) {
      cursorXMm = leftMm;
      rowTopMm += ROW_HEIGHT_MM + GEOMETRY.headerRowGapMm;
      rows += 1;
    }
    placed.push({
      id: field.id,
      label: field.label,
      labelAnchor: { xMm: cursorXMm, yMm: rowTopMm + GEOMETRY.headerLabelMm - 1.2 },
      box: {
        xMm: cursorXMm,
        yMm: rowTopMm + GEOMETRY.headerLabelMm,
        wMm: widthMm,
        hMm: GEOMETRY.writtenBoxHeightMm,
      },
    });
    cursorXMm += widthMm + GEOMETRY.headerFieldGapMm;
  }

  return {
    fields: placed,
    heightMm: rows * ROW_HEIGHT_MM + (rows - 1) * GEOMETRY.headerRowGapMm,
  };
}
