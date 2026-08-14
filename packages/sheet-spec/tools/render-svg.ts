// Preview renderer used to eyeball a layout and to regenerate the design
// mockups. The production sheet is produced by Typst, which needs correct
// Arabic shaping; this renderer exists so geometry can be reviewed without a
// PDF toolchain, and it reads the same layout the scanner will sample.

import { GEOMETRY } from '../src/index';
import type {
  GridFieldLayout,
  QuestionColumn,
  QuestionRow,
  Rect,
  SheetCodeLayout,
  SheetLayout,
} from '../src/index';

const FONT = "font-family=\"'Noto Sans Arabic', 'Segoe UI', Arial, sans-serif\"";
const INK = '#111';
const LIGHT = '#888';
/** A letter beside a bubble is outside every sampled area, so it prints darker. */
const LABEL = '#3d4348';

const escapeText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const round = (value: number): string => value.toFixed(2).replace(/\.00$/, '');

const rect = (box: Rect, fill: string, stroke?: string): string =>
  `<rect x="${round(box.xMm)}" y="${round(box.yMm)}" width="${round(box.wMm)}" height="${round(box.hMm)}"` +
  ` fill="${fill}"${stroke === undefined ? '' : ` stroke="${stroke}" stroke-width="0.4"`}/>`;

const choiceText = (label: { anchor: { xMm: number; yMm: number }; symbol: string }): string =>
  `<text x="${round(label.anchor.xMm)}" y="${round(label.anchor.yMm + 1)}" font-size="2.6" text-anchor="middle"` +
  ` ${FONT} fill="${LABEL}">${escapeText(label.symbol)}</text>`;

/** The choice letters of one row, when the row carries any of its own. */
function renderChoiceLabels(row: QuestionRow): string[] {
  if (row.symbolsInBubbles) {
    return row.bubbles.map(
      (bubble) =>
        `<text x="${round(bubble.cxMm)}" y="${round(bubble.cyMm + 1)}" font-size="2.2" text-anchor="middle"` +
        ` ${FONT} fill="${LIGHT}">${escapeText(bubble.symbol)}</text>`,
    );
  }
  return row.choiceLabels.map(choiceText);
}

function renderQuestions(columns: readonly QuestionColumn[]): string[] {
  return columns.flatMap((column) => [
    ...column.headers.flatMap((header) => header.labels.map(choiceText)),
    ...column.rows.flatMap((row) => [
      `<text x="${round(row.numberAnchor.xMm)}" y="${round(row.numberAnchor.yMm + 1.3)}" font-size="3.4"` +
        ` text-anchor="end" ${FONT} fill="${INK}">${String(row.question)}</text>`,
      ...row.bubbles.map(
        (bubble) =>
          `<circle cx="${round(bubble.cxMm)}" cy="${round(bubble.cyMm)}" r="${round(bubble.rMm)}"` +
          ` fill="none" stroke="${LIGHT}" stroke-width="0.35"/>`,
      ),
      ...renderChoiceLabels(row),
    ]),
  ]);
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

/**
 * The real modules, not a stand-in. The layout carries them, so a mockup shows
 * the code at the size it will actually print, which is the whole point of
 * reviewing a mockup.
 */
function renderCode(code: SheetCodeLayout): string[] {
  const size = code.modules.length;
  if (size === 0) return [];
  const quiet = GEOMETRY.codeQuietModules;
  const moduleMm = code.box.wMm / (size + 2 * quiet);
  const originXMm = code.box.xMm + moduleMm * quiet;
  const originYMm = code.box.yMm + moduleMm * quiet;

  return code.modules.flatMap((row, y) =>
    row.flatMap((dark, x) =>
      dark
        ? [
            rect(
              {
                xMm: originXMm + x * moduleMm,
                yMm: originYMm + y * moduleMm,
                wMm: moduleMm + 0.01,
                hMm: moduleMm + 0.01,
              },
              INK,
            ),
          ]
        : [],
    ),
  );
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
      `<text transform="rotate(${String(rotationDeg)} ${round(xMm)} ${round(yMm)})" x="${round(xMm)}" y="${round(yMm)}"` +
      ` font-size="4" text-anchor="middle" ${FONT} fill="${INK}">${escapeText(text)}</text>`
    );
  };

  const body = [
    `<rect width="${String(widthMm)}" height="${String(heightMm)}" fill="white"/>`,
    ...layout.fiducials.map((box) => rect(box, INK)),
    ...layout.timingMarks.map((box) => rect(box, INK)),
    ...renderCode(layout.code),
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
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(widthMm)} ${String(heightMm)}" width="${String(widthMm * 3)}" height="${String(heightMm * 3)}">`,
    ...body,
    '</svg>',
  ].join('\n');
}
