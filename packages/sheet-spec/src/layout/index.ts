// Turns a sheet specification into printable geometry.
//
// This is the one place that decides where anything sits on the page. The PDF
// generator draws what it returns and the scanner samples what it returns, so
// the two can never disagree about where a bubble is.

import { codeMatrix, encodeSheetCode } from '../code/index';
import { MAX_QR_MODULES } from '../code/matrix';
import { GEOMETRY, PAPER } from '../paper';
import type { BubbleGridField, SheetSpec, WrittenBoxField } from '../spec';
import type { LayoutResult, Rect, SheetCodeLayout, SheetLayout } from '../types';
import { planHeader } from './header';
import { columnWidthMm, planGrid, resolveColumns } from './grid';
import { planSidebar } from './sidebar';

const isWrittenBox = (field: SheetSpec['headerFields'][number]): field is WrittenBoxField =>
  field.kind === 'writtenBox';

const isBubbleGrid = (field: SheetSpec['headerFields'][number]): field is BubbleGridField =>
  field.kind === 'bubbleGrid';

function cornerFiducials(widthMm: number, heightMm: number): readonly Rect[] {
  const { marginMm: m, fiducialMm: f } = GEOMETRY;
  // Order matters: the scanner maps these to destination corners in the same
  // sequence when it solves the perspective transform.
  const corners = [
    [m, m],
    [widthMm - m - f, m],
    [m, heightMm - m - f],
    [widthMm - m - f, heightMm - m - f],
  ] as const;
  return corners.map(([xMm, yMm]) => ({ xMm, yMm, wMm: f, hMm: f }));
}

export function layoutSheet(spec: SheetSpec): LayoutResult {
  const paper = PAPER[spec.paper];
  const contentLeftMm = GEOMETRY.marginMm + GEOMETRY.timingWidthMm + GEOMETRY.brandingBandMm;
  const contentRightMm = paper.widthMm - GEOMETRY.marginMm - GEOMETRY.titleBandMm;
  const contentWidthMm = contentRightMm - contentLeftMm;

  const headerTopMm = GEOMETRY.marginMm + GEOMETRY.fiducialMm + GEOMETRY.headerGapMm;

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
  const codeSizeMm = (moduleCount + 2 * GEOMETRY.codeQuietModules) * GEOMETRY.codeModuleMm;

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
  const bodyLimitMm = paper.heightMm - GEOMETRY.marginMm - GEOMETRY.warningBandMm;
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
  const grid = planGrid(spec, contentLeftMm, bodyTopMm, columnCount);

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
    version: 3,
    paper: { widthMm: paper.widthMm, heightMm: paper.heightMm },
    fiducials: cornerFiducials(paper.widthMm, paper.heightMm),
    timingMarks: grid.timingMarks,
    code,
    branding: {
      text: spec.branding,
      band: {
        xMm: GEOMETRY.marginMm + GEOMETRY.timingWidthMm,
        yMm: bodyTopMm,
        wMm: GEOMETRY.brandingBandMm,
        hMm: grid.heightMm,
      },
      rotationDeg: -90,
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
      yMm: paper.heightMm - GEOMETRY.marginMm - GEOMETRY.fiducialMm - 3,
    },
  };

  return { kind: 'ok', layout };
}
