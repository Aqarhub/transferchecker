// Preview renderer used to eyeball a layout and to regenerate the design
// mockups. The production sheet is produced by Typst, which needs correct
// Arabic shaping; this renderer exists so geometry can be reviewed without a
// PDF toolchain, and it reads the same layout the scanner will sample.

import type { GridFieldLayout, QuestionColumn, Rect, SheetLayout } from '../src/index';

const FONT = "font-family=\"'Noto Sans Arabic', 'Segoe UI', Arial, sans-serif\"";
const INK = '#111';
const LIGHT = '#888';

const escapeText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const round = (value: number): string => value.toFixed(2).replace(/\.00$/, '');

const rect = (box: Rect, fill: string, stroke?: string): string =>
  `<rect x="${round(box.xMm)}" y="${round(box.yMm)}" width="${round(box.wMm)}" height="${round(box.hMm)}"` +
  ` fill="${fill}"${stroke === undefined ? '' : ` stroke="${stroke}" stroke-width="0.4"`}/>`;

function renderQuestions(columns: readonly QuestionColumn[]): string[] {
  return columns.flatMap((column) =>
    column.rows.flatMap((row) => [
      `<text x="${round(row.numberAnchor.xMm)}" y="${round(row.numberAnchor.yMm + 1.3)}" font-size="3.4"` +
        ` text-anchor="end" ${FONT} fill="${INK}">${row.question}</text>`,
      ...row.bubbles.flatMap((bubble) => [
        `<circle cx="${round(bubble.cxMm)}" cy="${round(bubble.cyMm)}" r="${round(bubble.rMm)}"` +
          ` fill="none" stroke="${LIGHT}" stroke-width="0.35"/>`,
        `<text x="${round(bubble.cxMm)}" y="${round(bubble.cyMm + 1)}" font-size="2.4" text-anchor="middle"` +
          ` ${FONT} fill="${LIGHT}">${escapeText(bubble.symbol)}</text>`,
      ]),
    ]),
  );
}

function renderGridField(field: GridFieldLayout): string[] {
  return [
    `<text x="${round(field.labelAnchor.xMm)}" y="${round(field.labelAnchor.yMm)}" font-size="3.2"` +
      ` ${FONT} fill="${INK}">${escapeText(field.label)}</text>`,
    rect(field.frame, 'none', INK),
    ...field.writeBoxes.map((box) => rect(box, 'none', INK)),
    ...field.columns.flatMap((column) =>
      column.bubbles.flatMap((bubble) => [
        `<circle cx="${round(bubble.cxMm)}" cy="${round(bubble.cyMm)}" r="${round(bubble.rMm)}"` +
          ` fill="none" stroke="${LIGHT}" stroke-width="0.35"/>`,
        `<text x="${round(bubble.cxMm)}" y="${round(bubble.cyMm + 1)}" font-size="2.4" text-anchor="middle"` +
          ` ${FONT} fill="${LIGHT}">${escapeText(bubble.symbol)}</text>`,
      ]),
    ),
  ];
}

/** Placeholder finder pattern standing in for the real QR payload. */
function renderQr(box: Rect): string[] {
  const cell = box.wMm / 9;
  const eye = (dx: number, dy: number): string =>
    rect({ xMm: box.xMm + dx * cell, yMm: box.yMm + dy * cell, wMm: cell * 2, hMm: cell * 2 }, INK);
  return [
    rect(box, 'none', INK),
    eye(1, 1),
    eye(6, 1),
    eye(1, 6),
    rect({ xMm: box.xMm + 4 * cell, yMm: box.yMm + 4 * cell, wMm: cell, hMm: cell }, INK),
  ];
}

export interface RenderOptions {
  /** Printed below the sheet, in the teacher's language plus English. */
  readonly warningLines: readonly string[];
}

export function renderSheetSvg(layout: SheetLayout, options: RenderOptions): string {
  const { widthMm, heightMm } = layout.paper;
  const vertical = (text: string, band: Rect, rotationDeg: number): string => {
    // The band is centered on its long axis and the renderer owns the baseline.
    const xMm = band.xMm + band.wMm / 2 + (rotationDeg < 0 ? 1.6 : -1.2);
    const yMm = band.yMm + band.hMm / 2;
    return (
      `<text transform="rotate(${rotationDeg} ${round(xMm)} ${round(yMm)})" x="${round(xMm)}" y="${round(yMm)}"` +
      ` font-size="4" text-anchor="middle" ${FONT} fill="${INK}">${escapeText(text)}</text>`
    );
  };

  const body = [
    `<rect width="${widthMm}" height="${heightMm}" fill="white"/>`,
    ...layout.fiducials.map((box) => rect(box, INK)),
    ...layout.timingMarks.map((box) => rect(box, INK)),
    ...renderQr(layout.qr),
    vertical(layout.branding.text, layout.branding.band, layout.branding.rotationDeg),
    vertical(layout.title.text, layout.title.band, layout.title.rotationDeg),
    ...layout.writtenFields.flatMap((field) => [
      `<text x="${round(field.labelAnchor.xMm)}" y="${round(field.labelAnchor.yMm)}" font-size="3.2"` +
        ` ${FONT} fill="${INK}">${escapeText(field.label)}</text>`,
      rect(field.box, 'none', INK),
    ]),
    ...renderQuestions(layout.questionColumns),
    ...layout.gridFields.flatMap(renderGridField),
    ...options.warningLines.map(
      (line, index) =>
        `<text x="${round(layout.warningAnchor.xMm)}" y="${round(layout.warningAnchor.yMm + index * 4.2)}"` +
        ` font-size="2.9" text-anchor="middle" ${FONT} fill="${INK}">${escapeText(line)}</text>`,
    ),
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthMm} ${heightMm}" width="${widthMm * 3}" height="${heightMm * 3}">`,
    ...body,
    '</svg>',
  ].join('\n');
}
