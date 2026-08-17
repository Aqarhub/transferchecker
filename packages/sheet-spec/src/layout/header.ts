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
  direction: 'ltr' | 'rtl' = 'ltr',
): HeaderPlan {
  if (fields.length === 0) {
    return { fields: [], heightMm: 0 };
  }

  const availableMm = Math.max(rightMm - leftMm, 0);
  const placed: WrittenBoxLayout[] = [];
  // An Arabic sheet reads from the right, so its first box sits there and the
  // row grows leftward. The cursor tracks the NEXT box's leading edge either
  // way, and only the arithmetic that advances it differs.
  const rtl = direction === 'rtl';
  let cursorXMm = rtl ? rightMm : leftMm;
  let rowTopMm = topMm;
  let rows = 1;

  for (const field of fields) {
    // A field wider than the band is clamped rather than allowed to overflow,
    // since the header can always be made to fit by shrinking a box.
    const widthMm = Math.min(FIELD_WIDTH_MM[field.width], availableMm);
    const startsRow = cursorXMm === (rtl ? rightMm : leftMm);
    const overflows = rtl ? cursorXMm - widthMm < leftMm : cursorXMm + widthMm > rightMm;
    if (!startsRow && overflows) {
      cursorXMm = rtl ? rightMm : leftMm;
      rowTopMm += ROW_HEIGHT_MM + GEOMETRY.headerRowGapMm;
      rows += 1;
    }
    const boxLeftMm = rtl ? cursorXMm - widthMm : cursorXMm;
    placed.push({
      id: field.id,
      label: field.label,
      labelAnchor: { xMm: boxLeftMm, yMm: rowTopMm + GEOMETRY.headerLabelMm - 1.2 },
      box: {
        xMm: boxLeftMm,
        yMm: rowTopMm + GEOMETRY.headerLabelMm,
        wMm: widthMm,
        hMm: GEOMETRY.writtenBoxHeightMm,
      },
    });
    cursorXMm = rtl
      ? cursorXMm - widthMm - GEOMETRY.headerFieldGapMm
      : cursorXMm + widthMm + GEOMETRY.headerFieldGapMm;
  }

  return {
    fields: placed,
    heightMm: rows * ROW_HEIGHT_MM + (rows - 1) * GEOMETRY.headerRowGapMm,
  };
}
