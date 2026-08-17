// Turns a sheet layout into Typst source.
//
// Typst is used because it is the only renderer verified to shape Arabic
// correctly while also placing content at exact millimetre offsets. Every
// coordinate here comes from the layout engine, so the printed sheet and the
// scanner read the same geometry.

import { GEOMETRY } from '@transferchecker/sheet-spec';
import type {
  GridFieldLayout,
  Point,
  QuestionColumn,
  QuestionRow,
  SheetCodeLayout,
  SheetLayout,
} from '@transferchecker/sheet-spec';
import { bubble, bubbleLabel, filledRect, strokedRect, textAt } from './draw';
import type { PagePlan } from './page';
import { DEFAULT_THEME, type SheetTheme } from './theme';
import { color, mm, strArray } from './typst-value';

const ORIGIN: Point = { xMm: 0, yMm: 0 };

export interface RenderOptions {
  /** Font stack. The first entry that contains a glyph wins, as in CSS. */
  readonly fonts: readonly string[];
  /** Printed at the foot of the sheet, one line per entry. */
  readonly warningLines: readonly string[];
  readonly theme?: SheetTheme;
  /** Several sheets on one page. Omit for one sheet per page. */
  readonly page?: PagePlan;
}

function renderCode(code: SheetCodeLayout, ink: string): string[] {
  const size = code.modules.length;
  if (size === 0) return [];
  // The box the layout gave includes the quiet zone the QR specification
  // requires, so the modules are inset by it rather than filling the box.
  const quiet = GEOMETRY.codeQuietModules;
  const moduleMm = code.box.wMm / (size + 2 * quiet);
  const originXMm = code.box.xMm + moduleMm * quiet;
  const originYMm = code.box.yMm + moduleMm * quiet;

  return code.modules.flatMap((row, y) =>
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

/** The choice letters of one row, when the row carries any of its own. */
function renderChoiceLabels(row: QuestionRow, theme: SheetTheme): string[] {
  if (row.symbolsInBubbles) {
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
  return columns.flatMap((column) => [
    // The letters above a run of questions, repeated down a long column so the
    // eye has somewhere to rest and never has to scroll back up to check.
    ...column.headers.flatMap((header) =>
      header.labels.map((label) =>
        textAt(
          label.anchor.xMm,
          label.anchor.yMm + theme.choiceLabelMm * 0.36,
          theme.choiceLabelMm,
          theme.choiceLabel,
          label.symbol,
          { align: 'center', widthMm: GEOMETRY.externalLabelMm },
        ),
      ),
    ),
    ...column.rows.flatMap((row) => [
      textAt(
        row.numberAnchor.xMm,
        row.numberAnchor.yMm + theme.questionSizeMm * 0.36,
        theme.questionSizeMm,
        theme.ink,
        String(row.question),
        // The box the number is right aligned in ends 2 mm before the first
        // bubble, the same 2 mm the layout's own anchor leaves, and starts
        // exactly at the column's left edge. It may not start before it:
        // defense د3 gives the timing marks 4 mm of blank paper, and the
        // leftmost column's gutter is what that clearance is measured against.
        { align: 'right', widthMm: GEOMETRY.numberGutterMm - 2 },
      ),
      ...row.bubbles.map((b) =>
        bubble(b.cxMm, b.cyMm, b.rMm, theme.bubbleStrokeMm, theme.bubbleStroke),
      ),
      ...renderChoiceLabels(row, theme),
    ]),
  ]);
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

/** A short anchored line: the site name or the template name. */
function anchoredText(at: SheetLayout['branding'], sizeMm: number, fill: string): string {
  const align = at.align === 'center' ? 'center' : at.align === 'end' ? 'right' : 'left';
  // The box the alignment resolves within is generous and invisible: layout
  // owns the anchor, typography stays the renderer's.
  return textAt(at.anchor.xMm, at.anchor.yMm, sizeMm, fill, at.text, {
    align,
    widthMm: align === 'left' ? 0 : 80,
  });
}

/** Every mark on one sheet, in the sheet's own coordinates. */
function sheetBody(layout: SheetLayout, options: RenderOptions, theme: SheetTheme): string[] {
  const { widthMm } = layout.paper;

  return [
    ...layout.fiducials.map((box) => filledRect(box, theme.ink)),
    // The four mid-edge marks, printed in the same solid ink as the corner
    // squares: they are the sheet's only registration evidence between the
    // corners, in both axes. The letterhead band is deliberately NOT drawn:
    // it is blank paper the institution stamps or prints its own header on.
    ...layout.edgeMarks.map((box) => filledRect(box, theme.ink)),
    ...renderCode(layout.code, theme.ink),

    anchoredText(layout.branding, theme.bandSizeMm, theme.ink),
    anchoredText(layout.title, theme.bandSizeMm, theme.ink),

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
        {
          align: 'center',
          // Bounded on both sides: by the sheet's left margin and by the
          // printed code, so a narrow paper never runs the warning into
          // either. The layout owns the anchor; this only sizes the box.
          widthMm: Math.max(
            30,
            Math.min(
              widthMm - 40,
              2 * (layout.warningAnchor.xMm - 12),
              2 * (layout.code.box.xMm - 4 - layout.warningAnchor.xMm),
            ),
          ),
        },
      ),
    ),
  ];
}

function renderCuts(plan: PagePlan, theme: SheetTheme): string[] {
  return plan.cuts.map((cut) => {
    const vertical = cut.axis === 'vertical';
    const lengthMm = vertical ? plan.carrier.heightMm : plan.carrier.widthMm;
    const dxMm = vertical ? cut.atMm : 0;
    const dyMm = vertical ? 0 : cut.atMm;
    return `#place(dx: ${mm(dxMm)}, dy: ${mm(dyMm)}, line(length: ${mm(lengthMm)}, angle: ${vertical ? '90deg' : '0deg'}, stroke: ${mm(theme.cutStrokeMm)} + ${color(theme.cutStroke)}))`;
  });
}

export function renderSheetTypst(layout: SheetLayout, options: RenderOptions): string {
  const theme = options.theme ?? DEFAULT_THEME;
  const { widthMm, heightMm } = layout.paper;
  // One sheet per page unless the caller planned otherwise.
  const plan = options.page ?? { carrier: layout.paper, origins: [ORIGIN], cuts: [] };

  const lines = [
    '// Generated from a sheet layout. Do not edit by hand.',
    `#set page(width: ${mm(plan.carrier.widthMm)}, height: ${mm(plan.carrier.heightMm)}, margin: 0pt, fill: white)`,
    `#set text(font: ${strArray(options.fonts)}, size: 8pt, fill: black, hyphenate: false)`,
    '',
    // The sheet is emitted once and laid on the page as many times as asked, so
    // two copies on one page can never differ from each other.
    '#let sheet = {',
    ...sheetBody(layout, options, theme).map((line) => `  ${line}`),
    '}',
    '',
    ...plan.origins.map(
      (origin) =>
        `#place(dx: ${mm(origin.xMm)}, dy: ${mm(origin.yMm)}, box(width: ${mm(widthMm)}, height: ${mm(heightMm)}, sheet))`,
    ),
    ...renderCuts(plan, theme),
  ];

  return `${lines.join('\n')}\n`;
}
