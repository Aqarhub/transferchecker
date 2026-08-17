// Turns a sheet specification into printable geometry.
//
// This is the one place that decides where anything sits on the page. The PDF
// generator draws what it returns and the scanner samples what it returns, so
// the two can never disagree about where a bubble is.
//
// Version 5 composition, top to bottom: the institution letterhead band, the
// corner squares, the header boxes with the template name under the smallest
// one, the question columns filled in whole groups with the identity stack
// under the tail column, and the foot line where the printed code sits against
// the right corner column with the site name beside it. Four small marks at
// the middle of the page edges are the sheet's only registration evidence
// between the corners, replacing version 4's timing strip and anchor columns.

import { codeMatrix, encodeSheetCode } from '../code/index';
import { MAX_QR_MODULES } from '../code/matrix';
import { GEOMETRY, PAPER, codeModuleMmFor, letterheadBandMm } from '../paper';
import type { BubbleGridField, SheetSpec, WrittenBoxField } from '../spec';
import type { LayoutResult, Rect, SheetCodeLayout, SheetLayout } from '../types';
import { planHeader } from './header';
import {
  columnHeightMm,
  columnWidthMm,
  gapsBefore,
  groupSizeOf,
  headerCountFor,
  planColumns,
  planGrid,
  rowsThatFit,
} from './grid';
import type { ColumnPlan } from './grid';
import { planSidebar, sidebarSizeMm } from './sidebar';

const isWrittenBox = (field: SheetSpec['headerFields'][number]): field is WrittenBoxField =>
  field.kind === 'writtenBox';

const isBubbleGrid = (field: SheetSpec['headerFields'][number]): field is BubbleGridField =>
  field.kind === 'bubbleGrid';

function cornerFiducials(widthMm: number, topMm: number, bottomMm: number): readonly Rect[] {
  const { marginSideMm: side, fiducialMm: f } = GEOMETRY;
  // Order matters: the scanner maps these to destination corners in the same
  // sequence when it solves the perspective transform.
  //
  // The rectangle they form is not centred on the page and does not need to
  // be: what the solve needs is four KNOWN positions, and the scanner rebuilds
  // these from the paper size the printed code carries. The top row sits under
  // the letterhead band when the sheet prints one, and at the plain top margin
  // when it does not.
  const corners = [
    [side, topMm],
    [widthMm - side - f, topMm],
    [side, bottomMm],
    [widthMm - side - f, bottomMm],
  ] as const;
  return corners.map(([xMm, yMm]) => ({ xMm, yMm, wMm: f, hMm: f }));
}

/**
 * The four mid-edge marks, in left, right, top, bottom order.
 *
 * Left and right sit halfway between the corner rows; top and bottom sit on
 * the corner rows themselves, centred on the page. Together with the corners
 * they measure the middle of the page in both axes, which is where a curled
 * sheet does its damage and where four corner points alone are blind.
 */
function edgeMarks(widthMm: number, fidTopMm: number, fidBottomMm: number): readonly Rect[] {
  const { marginSideMm: side, fiducialMm: f, edgeMarkMm: m } = GEOMETRY;
  const midYMm = (fidTopMm + f + fidBottomMm) / 2 - m / 2;
  const rowInset = (f - m) / 2;
  return [
    { xMm: side, yMm: midYMm, wMm: m, hMm: m },
    { xMm: widthMm - side - m, yMm: midYMm, wMm: m, hMm: m },
    { xMm: (widthMm - m) / 2, yMm: fidTopMm + rowInset, wMm: m, hMm: m },
    { xMm: (widthMm - m) / 2, yMm: fidBottomMm + rowInset, wMm: m, hMm: m },
  ];
}

export function layoutSheet(spec: SheetSpec): LayoutResult {
  const paper = PAPER[spec.paper];
  const { marginSideMm: side, fiducialMm: fid } = GEOMETRY;

  // The letterhead band decides where the top corner row sits. The band
  // itself stays blank: the institution stamps or prints its own header there.
  const bandMm = spec.letterhead ? letterheadBandMm(paper) : 0;
  const letterhead: Rect | null =
    bandMm > 0
      ? {
          xMm: side,
          yMm: GEOMETRY.letterheadTopMm,
          wMm: paper.widthMm - 2 * side,
          hMm: bandMm,
        }
      : null;
  const fidTopMm =
    bandMm > 0
      ? GEOMETRY.letterheadTopMm + bandMm + GEOMETRY.letterheadClearMm
      : GEOMETRY.marginTopMm;
  const fidBottomMm = paper.heightMm - GEOMETRY.marginBottomMm - fid;

  // The code is measured first because it is the only element whose size comes
  // from the sheet's own contents, and everything above it has to know where
  // its top edge lands. It sits at the foot, right edge on the corner-square
  // column, which is what lets the scanner find it before it knows the paper.
  const payload = encodeSheetCode(spec);
  const modules = codeMatrix(payload);
  // A payload no QR can carry is measured against the largest QR that exists,
  // so it reports as an ordinary overflow with a real number behind it rather
  // than as a special case. The remedy either way is the same: carry less.
  const moduleCount = modules?.length ?? MAX_QR_MODULES;
  // Defense د6: the module is derived from the count, not fixed, so the code
  // spends the whole budget it was given rather than the minimum it could.
  const codeSizeMm = (moduleCount + 2 * GEOMETRY.codeQuietModules) * codeModuleMmFor(moduleCount);

  if (modules === null || codeSizeMm > GEOMETRY.codeMaxSizeMm) {
    return {
      kind: 'overflow',
      area: 'code',
      axis: 'width',
      neededMm: codeSizeMm,
      availableMm: GEOMETRY.codeMaxSizeMm,
    };
  }

  const code: SheetCodeLayout = {
    box: {
      xMm: paper.widthMm - side - codeSizeMm,
      yMm: fidBottomMm - GEOMETRY.codeBottomClearMm - codeSizeMm,
      wMm: codeSizeMm,
      hMm: codeSizeMm,
    },
    modules,
    payload,
  };

  // Content keeps clear of the mid-edge marks on both sides.
  const contentLeftMm = side + GEOMETRY.edgeMarkMm + GEOMETRY.edgeMarkClearMm;
  const contentRightMm = paper.widthMm - contentLeftMm;
  const availableWidthMm = contentRightMm - contentLeftMm;

  const headerTopMm = fidTopMm + fid + GEOMETRY.headerGapMm;
  const header = planHeader(
    spec.headerFields.filter(isWrittenBox),
    contentLeftMm,
    contentRightMm,
    headerTopMm,
    spec.direction,
  );

  // The template name prints inside the gap under the header, over the box
  // margin rather than over a row of bubbles.
  const bodyTopMm = headerTopMm + header.heightMm + GEOMETRY.gridGapMm;
  const bodyLimitMm = code.box.yMm - GEOMETRY.gridGapMm;
  const bodyHeightMm = bodyLimitMm - bodyTopMm;

  const colW = columnWidthMm(spec);
  const grids = spec.headerFields.filter(isBubbleGrid);
  const stack = sidebarSizeMm(grids, spec.bubble);
  const groupSize = groupSizeOf(spec);

  // A fixed column count is a request, and a request that cannot fit an empty
  // page is the grid's fault: blaming anything else would send the teacher to
  // the wrong control. Auto only needs one column to survive.
  const requestedGridMm =
    spec.columns === 'auto'
      ? colW
      : spec.columns * colW + (spec.columns - 1) * GEOMETRY.columnGapMm;
  if (requestedGridMm > availableWidthMm) {
    return {
      kind: 'overflow',
      area: 'questions',
      axis: 'width',
      neededMm: requestedGridMm,
      availableMm: availableWidthMm,
    };
  }

  // The identity stack under the tail column may run below the columns' own
  // limit, down to the code's top edge: the code hugs the right margin and the
  // tail slot never reaches it.
  const stackLimitMm = code.box.yMm - GEOMETRY.sidebarBottomClearMm;

  /** Whether the stack fits under this candidate's tail column. */
  const stackFitsBelow = (plan: ColumnPlan): boolean => {
    if (stack.widthMm === 0) return true;
    if (stack.widthMm > colW) return false;
    const tailMinMm =
      columnHeightMm(plan.tailRows, spec.bubble.pitchYMm, groupSize) +
      headerCountFor(spec, plan.rowsPerColumn) * GEOMETRY.choiceHeaderMm;
    return bodyTopMm + tailMinMm + GEOMETRY.sidebarTailGapMm + stack.heightMm <= stackLimitMm;
  };

  const blockWidthMm = (plan: ColumnPlan): number => {
    const columnsMm = plan.columnCount * colW + (plan.columnCount - 1) * GEOMETRY.columnGapMm;
    return stackFitsBelow(plan) ? columnsMm : columnsMm + GEOMETRY.columnGapMm + stack.widthMm;
  };

  const rowsCap = rowsThatFit(spec, bodyHeightMm);
  const plan = planColumns(
    spec,
    rowsCap,
    (candidate) => blockWidthMm(candidate) <= availableWidthMm,
  );

  if (plan === null) {
    // Nothing fits. Reported against the tightest single-column attempt, so
    // the caller sees a real number rather than a shrug: with fewer rows than
    // one group the height is the wall, otherwise it is the width of the
    // narrowest block that could hold the questions.
    // When even the widest allowed spread of columns leaves too many rows per
    // column, the height is the binding wall, not the width.
    const widestColumns = spec.columns === 'auto' ? 6 : spec.columns;
    const rowsNeeded = Math.ceil(spec.questions.length / widestColumns);
    if (rowsCap < 1 || rowsNeeded > rowsCap) {
      return {
        kind: 'overflow',
        area: 'questions',
        axis: 'height',
        neededMm: columnHeightMm(Math.max(1, rowsNeeded), spec.bubble.pitchYMm, groupSize),
        availableMm: bodyHeightMm,
      };
    }
    // When the questions alone would have fitted, the identity stack is what
    // does not, and blaming the questions would send the teacher to the wrong
    // control.
    const withoutStack = planColumns(spec, rowsCap, (candidate) => {
      const columnsMm =
        candidate.columnCount * colW + (candidate.columnCount - 1) * GEOMETRY.columnGapMm;
      return columnsMm <= availableWidthMm;
    });
    if (withoutStack !== null && stack.widthMm > 0) {
      const columnsMm =
        withoutStack.columnCount * colW + (withoutStack.columnCount - 1) * GEOMETRY.columnGapMm;
      return {
        kind: 'overflow',
        area: 'sidebar',
        axis: 'width',
        neededMm: stack.widthMm,
        availableMm: Math.max(0, availableWidthMm - columnsMm - GEOMETRY.columnGapMm),
      };
    }
    const columns = Math.ceil(spec.questions.length / rowsCap);
    const tightest: ColumnPlan = {
      rowsPerColumn: rowsCap,
      tailRows: spec.questions.length - (columns - 1) * rowsCap,
      columnCount: columns,
    };
    return {
      kind: 'overflow',
      area: 'questions',
      axis: 'width',
      neededMm: blockWidthMm(tightest),
      availableMm: availableWidthMm,
    };
  }

  const belowTail = stackFitsBelow(plan);
  if (!belowTail && stack.heightMm > bodyHeightMm) {
    return {
      kind: 'overflow',
      area: 'sidebar',
      axis: 'height',
      neededMm: stack.heightMm,
      availableMm: bodyHeightMm,
    };
  }

  // The rows spread to use the height they were given, capped so a three
  // question sheet does not end up a finger apart. With the stack under the
  // tail, the tail column's own budget is the tighter of the two caps.
  const headerHeightMm = headerCountFor(spec, plan.rowsPerColumn) * GEOMETRY.choiceHeaderMm;
  const fullCapMm =
    (bodyHeightMm -
      headerHeightMm -
      gapsBefore(plan.rowsPerColumn, groupSize) * GEOMETRY.groupGapMm) /
    plan.rowsPerColumn;
  const tailCapMm =
    !belowTail || stack.heightMm === 0
      ? Number.POSITIVE_INFINITY
      : (stackLimitMm -
          bodyTopMm -
          headerHeightMm -
          GEOMETRY.sidebarTailGapMm -
          stack.heightMm -
          gapsBefore(plan.tailRows, groupSize) * GEOMETRY.groupGapMm) /
        plan.tailRows;
  const pitchMm = Math.max(
    spec.bubble.pitchYMm,
    Math.floor(Math.min(fullCapMm, tailCapMm, GEOMETRY.maxRowPitchMm) * 10) / 10,
  );

  const blockMm = blockWidthMm(plan);
  const gridLeftMm = (paper.widthMm - blockMm) / 2;
  const grid = planGrid(spec, plan, gridLeftMm, bodyTopMm, pitchMm);

  // The identity stack: under the tail column when it fits, in its own slot
  // at the block's edge when it does not.
  const tailSlotLeftMm = gridLeftMm + (plan.columnCount - 1) * (colW + GEOMETRY.columnGapMm);
  const sidebar = belowTail
    ? planSidebar(
        grids,
        spec.bubble,
        // Centred within the tail column's slot.
        tailSlotLeftMm + (colW + stack.widthMm) / 2,
        bodyTopMm + grid.tailHeightMm + GEOMETRY.sidebarTailGapMm,
      )
    : planSidebar(grids, spec.bubble, gridLeftMm + blockMm, bodyTopMm);

  // The template name, printed so a teacher can tell two sheets apart by eye
  // without a device. It sits under the narrowest header box, where the
  // approved design put it; with no boxes it keeps the same line at the
  // content's leading edge.
  const narrowest = [...header.fields].sort((a, b) => a.box.wMm - b.box.wMm)[0];
  const titleAnchor = narrowest
    ? {
        xMm: narrowest.box.xMm + narrowest.box.wMm / 2,
        yMm: narrowest.box.yMm + narrowest.box.hMm + 4.4,
      }
    : { xMm: contentLeftMm + 20, yMm: headerTopMm + 4.4 };

  const layout: SheetLayout = {
    version: 5,
    paper: { widthMm: paper.widthMm, heightMm: paper.heightMm },
    fiducials: cornerFiducials(paper.widthMm, fidTopMm, fidBottomMm),
    edgeMarks: edgeMarks(paper.widthMm, fidTopMm, fidBottomMm),
    letterhead,
    code,
    // The site name, on the foot line beside the code.
    branding: {
      text: spec.branding,
      anchor: {
        xMm: code.box.xMm - GEOMETRY.brandGapMm,
        yMm: code.box.yMm + code.box.hMm - 2,
      },
      align: 'end',
    },
    title: { text: spec.name, anchor: titleAnchor, align: 'center' },
    writtenFields: header.fields,
    gridFields: sidebar.fields,
    questionColumns: grid.columns,
    // The print warning shares the foot line, centred in the room left of the
    // brand text.
    warningAnchor: {
      xMm: (contentLeftMm + code.box.xMm - GEOMETRY.brandGapMm - 30) / 2,
      yMm: code.box.yMm + code.box.hMm - 2,
    },
  };

  return { kind: 'ok', layout };
}
