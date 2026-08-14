// Turns a sheet layout into Typst source.
//
// Typst is used because it is the only renderer verified to shape Arabic
// correctly while also placing content at exact millimetre offsets. Every
// coordinate here comes from the layout engine, so the printed sheet and the
// scanner read the same geometry.

import { GEOMETRY } from '@transferchecker/sheet-spec';
import type {
  GridFieldLayout,
  QuestionColumn,
  QuestionRow,
  Rect,
  SheetLayout,
} from '@transferchecker/sheet-spec';
import { bubble, bubbleLabel, filledRect, strokedRect, textAt, textInBand } from './draw';
import { DEFAULT_THEME, type SheetTheme } from './theme';
import { mm, strArray } from './typst-value';

/** A QR payload rendered as modules. True is a dark module. */
export type QrMatrix = readonly (readonly boolean[])[];

export interface RenderOptions {
  /** Font stack. The first entry that contains a glyph wins, as in CSS. */
  readonly fonts: readonly string[];
  /** Printed at the foot of the sheet, one line per entry. */
  readonly warningLines: readonly string[];
  /** Carries the template identity to the scanner. */
  readonly qr: QrMatrix;
  readonly theme?: SheetTheme;
}

function renderQr(box: Rect, matrix: QrMatrix, ink: string): string[] {
  const size = matrix.length;
  if (size === 0) return [];
  // A quiet zone of four modules is what the QR specification requires for a
  // reliable read, so the modules are inset rather than filling the box.
  const moduleMm = box.wMm / (size + 8);
  const originXMm = box.xMm + moduleMm * 4;
  const originYMm = box.yMm + moduleMm * 4;

  return matrix.flatMap((row, y) =>
    row.flatMap((dark, x) =>
      dark
        ? [
            filledRect(
              {
                xMm: originXMm + x * moduleMm,
                yMm: originYMm + y * moduleMm,
                // A hairline overlap keeps neighbouring modules from showing a
                // seam once the printer rounds to its own device pixels.
                wMm: moduleMm + 0.01,
                hMm: moduleMm + 0.01,
              },
              ink,
            ),
          ]
        : [],
    ),
  );
}

/**
 * The choice letters of one row. A letter is printed either inside its bubble
 * or beside it, never both, and the layout says which by leaving `choiceLabels`
 * empty for the inside case.
 */
function renderChoiceLabels(row: QuestionRow, theme: SheetTheme): string[] {
  if (row.choiceLabels.length === 0) {
    return row.bubbles.map((b) =>
      bubbleLabel(b.cxMm, b.cyMm, b.rMm, theme.bubbleLabelMm, theme.bubbleLabel, b.symbol),
    );
  }
  return row.choiceLabels.map((label) =>
    textAt(
      label.anchor.xMm,
      label.anchor.yMm + theme.choiceLabelMm * 0.36,
      theme.choiceLabelMm,
      theme.choiceLabel,
      label.symbol,
      { align: 'center', widthMm: GEOMETRY.externalLabelMm },
    ),
  );
}

function renderQuestions(columns: readonly QuestionColumn[], theme: SheetTheme): string[] {
  return columns.flatMap((column) =>
    column.rows.flatMap((row) => [
      textAt(
        row.numberAnchor.xMm,
        row.numberAnchor.yMm + theme.questionSizeMm * 0.36,
        theme.questionSizeMm,
        theme.ink,
        String(row.question),
        { align: 'right', widthMm: 8 },
      ),
      ...row.bubbles.map((b) =>
        bubble(b.cxMm, b.cyMm, b.rMm, theme.bubbleStrokeMm, theme.bubbleStroke),
      ),
      ...renderChoiceLabels(row, theme),
    ]),
  );
}

function renderGridField(field: GridFieldLayout, theme: SheetTheme): string[] {
  return [
    textAt(field.labelAnchor.xMm, field.labelAnchor.yMm, theme.labelSizeMm, theme.ink, field.label),
    strokedRect(field.frame, theme.frameStrokeMm, theme.frameStroke),
    ...field.writeBoxes.map((box) => strokedRect(box, theme.boxStrokeMm, theme.boxStroke)),
    ...field.columns.flatMap((column) =>
      column.bubbles.flatMap((b) => [
        bubble(b.cxMm, b.cyMm, b.rMm, theme.bubbleStrokeMm, theme.bubbleStroke),
        bubbleLabel(b.cxMm, b.cyMm, b.rMm, theme.bubbleLabelMm, theme.bubbleLabel, b.symbol),
      ]),
    ),
  ];
}

export function renderSheetTypst(layout: SheetLayout, options: RenderOptions): string {
  const theme = options.theme ?? DEFAULT_THEME;
  const { widthMm, heightMm } = layout.paper;

  const lines = [
    '// Generated from a sheet layout. Do not edit by hand.',
    `#set page(width: ${mm(widthMm)}, height: ${mm(heightMm)}, margin: 0pt, fill: white)`,
    `#set text(font: ${strArray(options.fonts)}, size: 8pt, fill: black, hyphenate: false)`,
    '',

    ...layout.fiducials.map((box) => filledRect(box, theme.ink)),
    ...layout.timingMarks.map((box) => filledRect(box, theme.ink)),
    ...renderQr(layout.qr, options.qr, theme.ink),

    textInBand(
      layout.branding.band,
      layout.branding.rotationDeg,
      theme.bandSizeMm,
      theme.ink,
      layout.branding.text,
    ),
    textInBand(
      layout.title.band,
      layout.title.rotationDeg,
      theme.bandSizeMm,
      theme.ink,
      layout.title.text,
    ),

    ...layout.writtenFields.flatMap((field) => [
      textAt(
        field.labelAnchor.xMm,
        field.labelAnchor.yMm,
        theme.labelSizeMm,
        theme.ink,
        field.label,
      ),
      strokedRect(field.box, theme.boxStrokeMm, theme.boxStroke),
    ]),

    ...renderQuestions(layout.questionColumns, theme),
    ...layout.gridFields.flatMap((field) => renderGridField(field, theme)),

    ...options.warningLines.map((line, index) =>
      textAt(
        layout.warningAnchor.xMm,
        layout.warningAnchor.yMm + index * (theme.warningSizeMm * 1.6),
        theme.warningSizeMm,
        theme.ink,
        line,
        { align: 'center', widthMm: widthMm - 40 },
      ),
    ),
  ];

  return `${lines.join('\n')}\n`;
}
