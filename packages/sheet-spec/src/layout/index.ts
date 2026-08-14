// Turns a sheet specification into printable geometry.
//
// This is the one place that decides where anything sits on the page. The PDF
// generator draws what it returns and the scanner samples what it returns, so
// the two can never disagree about where a bubble is.

import { GEOMETRY, PAPER } from '../paper';
import type { BubbleGridField, SheetSpec, WrittenBoxField } from '../spec';
import type { LayoutResult, Rect, SheetLayout } from '../types';
import { planHeader } from './header';
import { planGrid } from './grid';
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

  const headerTopMm = GEOMETRY.marginMm + GEOMETRY.fiducialMm + GEOMETRY.headerGapMm;
  const qr: Rect = {
    xMm: contentRightMm - GEOMETRY.qrSizeMm,
    yMm: headerTopMm,
    wMm: GEOMETRY.qrSizeMm,
    hMm: GEOMETRY.qrSizeMm,
  };

  const header = planHeader(
    spec.headerFields.filter(isWrittenBox),
    contentLeftMm,
    qr.xMm - GEOMETRY.headerFieldGapMm,
    headerTopMm,
  );

  const bodyTopMm = Math.max(headerTopMm + header.heightMm, qr.yMm + qr.hMm) + GEOMETRY.gridGapMm;
  const bodyLimitMm = paper.heightMm - GEOMETRY.marginMm - GEOMETRY.warningBandMm;
  const bodyHeightMm = bodyLimitMm - bodyTopMm;

  // The question grid is the primary content, so it is measured against the
  // whole content band first. Only then is the sidebar asked to fit in what is
  // left, which keeps the blame on the optional part when both cannot fit.
  const contentWidthMm = contentRightMm - contentLeftMm;
  const grid = planGrid(spec, contentLeftMm, bodyTopMm);

  if (grid.widthMm > contentWidthMm) {
    return {
      kind: 'overflow',
      area: 'questions',
      axis: 'width',
      neededMm: grid.widthMm,
      availableMm: contentWidthMm,
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

  const sidebar = planSidebar(
    spec.headerFields.filter(isBubbleGrid),
    spec.bubble,
    contentRightMm,
    bodyTopMm,
  );
  const sidebarLimitMm = contentWidthMm - grid.widthMm - GEOMETRY.sidebarGapMm;

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

  const layout: SheetLayout = {
    version: 2,
    paper: { widthMm: paper.widthMm, heightMm: paper.heightMm },
    fiducials: cornerFiducials(paper.widthMm, paper.heightMm),
    timingMarks: grid.timingMarks,
    qr,
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
    title: {
      text: spec.title,
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
