// Turns a sheet specification into printable geometry.
//
// This is the one place that decides where anything sits on the page. The PDF
// generator draws what it returns and the scanner samples what it returns, so
// the two can never disagree about where a bubble is.

import { codeMatrix, encodeSheetCode } from '../code/index';
import { MAX_QR_MODULES } from '../code/matrix';
import { GEOMETRY, PAPER, codeModuleMmFor } from '../paper';
import type { BubbleGridField, SheetSpec, WrittenBoxField } from '../spec';
import type { AnchorColumn, LayoutResult, Rect, SheetCodeLayout, SheetLayout } from '../types';
import { planHeader } from './header';
import { columnWidthMm, planGrid, resolveColumns } from './grid';
import { planSidebar } from './sidebar';

const isWrittenBox = (field: SheetSpec['headerFields'][number]): field is WrittenBoxField =>
  field.kind === 'writtenBox';

const isBubbleGrid = (field: SheetSpec['headerFields'][number]): field is BubbleGridField =>
  field.kind === 'bubbleGrid';

function cornerFiducials(widthMm: number, heightMm: number): readonly Rect[] {
  const { marginTopMm: top, marginSideMm: side, marginBottomMm: bottom, fiducialMm: f } = GEOMETRY;
  // Order matters: the scanner maps these to destination corners in the same
  // sequence when it solves the perspective transform.
  //
  // The lower pair sits further in than the upper pair, defense د1. The
  // rectangle they form is not centred on the page and does not need to be:
  // what the solve needs is four KNOWN positions, and the scanner rebuilds
  // these from the paper size the printed code carries.
  const corners = [
    [side, top],
    [widthMm - side - f, top],
    [side, heightMm - bottom - f],
    [widthMm - side - f, heightMm - bottom - f],
  ] as const;
  return corners.map(([xMm, yMm]) => ({ xMm, yMm, wMm: f, hMm: f }));
}

/**
 * An extra anchor column in the blank band to the right of the question grid.
 *
 * A one column sheet has no gap between columns and would otherwise print no
 * anchor at all, which leaves the smallest and commonest sheets with no
 * evidence in x anywhere. They always have the room instead, and that is a
 * guarantee rather than a habit: a layout is REFUSED unless what is left after
 * the grid is at least `sidebarGapMm` wide, whether or not there is a sidebar
 * to gap from, and 8 mm is exactly what a 3 mm mark with 2.5 mm of clearance on
 * each side needs. So no sheet that lays out at all goes without an anchor. A
 * test holds those two numbers together, because lowering the gap would quietly
 * take the anchor off the sheets that have nowhere else to put one.
 *
 * The marks take their y from the timing marks, so they sit on exactly the rows
 * everything else the scanner measures sits on.
 */
function trailingAnchor(
  timingMarks: readonly Rect[],
  leftMm: number,
  rightMm: number,
): AnchorColumn[] {
  const neededMm = GEOMETRY.anchorWidthMm + 2 * GEOMETRY.anchorClearMm;
  if (rightMm - leftMm < neededMm || timingMarks.length === 0) return [];

  const xMm = (leftMm + rightMm) / 2;
  return [
    {
      xMm,
      marks: timingMarks.map((mark) => ({
        xMm: xMm - GEOMETRY.anchorWidthMm / 2,
        yMm: mark.yMm,
        wMm: GEOMETRY.anchorWidthMm,
        hMm: mark.hMm,
      })),
    },
  ];
}

export function layoutSheet(spec: SheetSpec): LayoutResult {
  const paper = PAPER[spec.paper];
  // Left of the content: the margin, the timing strip, and then blank paper.
  // Defense د3 put the clearance there and moved the branding band to the right
  // edge, so nothing is printed beside a timing mark any more.
  const contentLeftMm = GEOMETRY.marginSideMm + GEOMETRY.timingWidthMm + GEOMETRY.timingClearMm;
  const contentRightMm =
    paper.widthMm - GEOMETRY.marginSideMm - GEOMETRY.titleBandMm - GEOMETRY.brandingBandMm;
  const contentWidthMm = contentRightMm - contentLeftMm;

  const headerTopMm = GEOMETRY.marginTopMm + GEOMETRY.fiducialMm + GEOMETRY.headerGapMm;

  // The code is measured first because it is the only element whose size comes
  // from the sheet's own contents. A sheet that carries its whole geometry
  // prints a larger code than one carrying an identifier, and everything to its
  // left has to know that before it can be placed.
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
      xMm: contentRightMm - codeSizeMm,
      yMm: headerTopMm,
      wMm: codeSizeMm,
      hMm: codeSizeMm,
    },
    modules,
    payload,
  };

  const header = planHeader(
    spec.headerFields.filter(isWrittenBox),
    contentLeftMm,
    code.box.xMm - GEOMETRY.headerFieldGapMm,
    headerTopMm,
  );

  const bodyTopMm =
    Math.max(headerTopMm + header.heightMm, code.box.yMm + code.box.hMm) + GEOMETRY.gridGapMm;
  const bodyLimitMm = paper.heightMm - GEOMETRY.marginBottomMm - GEOMETRY.warningBandMm;
  const bodyHeightMm = bodyLimitMm - bodyTopMm;

  // A fixed column count is a request, so the sidebar must leave room for all
  // of it. Auto only needs one column to survive.
  const oneColumnMm = columnWidthMm(spec);
  const requestedGridMm =
    spec.columns === 'auto'
      ? oneColumnMm
      : spec.columns * oneColumnMm + (spec.columns - 1) * GEOMETRY.columnGapMm;

  // Judged before the sidebar: a grid that cannot fit an empty page is the
  // grid's fault, and blaming the sidebar for it would send the teacher to the
  // wrong control.
  if (requestedGridMm > contentWidthMm) {
    return {
      kind: 'overflow',
      area: 'questions',
      axis: 'width',
      neededMm: requestedGridMm,
      availableMm: contentWidthMm,
    };
  }

  // The sidebar is measured next because its width does not depend on how the
  // questions are arranged, while the column count depends on what it leaves.
  const sidebar = planSidebar(
    spec.headerFields.filter(isBubbleGrid),
    spec.bubble,
    contentRightMm,
    bodyTopMm,
  );
  const sidebarLimitMm = contentWidthMm - requestedGridMm - GEOMETRY.sidebarGapMm;

  if (sidebar.widthMm > sidebarLimitMm) {
    return {
      kind: 'overflow',
      area: 'sidebar',
      axis: 'width',
      neededMm: sidebar.widthMm,
      availableMm: sidebarLimitMm,
    };
  }
  if (sidebar.heightMm > bodyHeightMm) {
    return {
      kind: 'overflow',
      area: 'sidebar',
      axis: 'height',
      neededMm: sidebar.heightMm,
      availableMm: bodyHeightMm,
    };
  }

  const gridWidthMm =
    sidebar.widthMm > 0 ? contentWidthMm - sidebar.widthMm - GEOMETRY.sidebarGapMm : contentWidthMm;
  const columnCount = resolveColumns(spec, gridWidthMm, bodyHeightMm);
  const grid = planGrid(spec, contentLeftMm, bodyTopMm, columnCount, bodyHeightMm);

  if (grid.widthMm > gridWidthMm) {
    return {
      kind: 'overflow',
      area: 'questions',
      axis: 'width',
      neededMm: grid.widthMm,
      availableMm: gridWidthMm,
    };
  }
  if (grid.heightMm > bodyHeightMm) {
    return {
      kind: 'overflow',
      area: 'questions',
      axis: 'height',
      neededMm: grid.heightMm,
      availableMm: bodyHeightMm,
    };
  }

  const layout: SheetLayout = {
    version: 4,
    paper: { widthMm: paper.widthMm, heightMm: paper.heightMm },
    fiducials: cornerFiducials(paper.widthMm, paper.heightMm),
    timingMarks: grid.timingMarks,
    anchorColumns: [
      ...grid.anchorColumns,
      ...trailingAnchor(
        grid.timingMarks,
        contentLeftMm + grid.widthMm,
        sidebar.widthMm > 0 ? contentRightMm - sidebar.widthMm : contentRightMm,
      ),
    ],
    code,
    // The site name. It used to run down the left edge with its ink starting at
    // the exact millimetre the timing marks ended, which is the clearance
    // defense د3 says a measuring mark must have, so it moved to the other edge
    // and the left of the sheet is now blank paper beside every mark.
    branding: {
      text: spec.branding,
      band: {
        xMm: contentRightMm + GEOMETRY.titleBandMm,
        yMm: bodyTopMm,
        wMm: GEOMETRY.brandingBandMm,
        hMm: grid.heightMm,
      },
      rotationDeg: 90,
    },
    // The template name, printed so a teacher can tell two sheets apart by eye
    // without a device. The QR carries the machine readable form.
    title: {
      text: spec.name,
      band: {
        xMm: contentRightMm,
        yMm: bodyTopMm,
        wMm: GEOMETRY.titleBandMm,
        hMm: grid.heightMm,
      },
      rotationDeg: 90,
    },
    writtenFields: header.fields,
    gridFields: sidebar.fields,
    questionColumns: grid.columns,
    warningAnchor: {
      xMm: paper.widthMm / 2,
      yMm: paper.heightMm - GEOMETRY.marginBottomMm - GEOMETRY.fiducialMm - 3,
    },
  };

  return { kind: 'ok', layout };
}
