// The sheets a teacher starts from.
//
// Most teachers never build a sheet. They pick a ready one and are grading
// within seconds, and being asked to design a form before seeing any value is a
// real barrier to entry. These three cover the ordinary cases.
//
// Structure lives here. **Every word a human reads is supplied by the caller**,
// so an Arabic interface passes Arabic and nothing here needs a special case
// for it.

import { digitSymbols, latinSymbols } from './alphabet';
import { smallestPaper } from './fit';
import type { PaperFamily } from './paper';
import { DEFAULT_BUBBLE, SheetSpecSchema } from './spec';
import type { BubbleMetrics, SheetSpec, SheetSpecInput } from './spec';

export const STOCK_TEMPLATES = ['quick20', 'standard50', 'full100'] as const;
export type StockTemplate = (typeof STOCK_TEMPLATES)[number];

/**
 * Template ids are printed into the code on every sheet, so a paper printed
 * today still resolves years from now. **These may never be regenerated.**
 */
const TEMPLATE_ID: Readonly<Record<StockTemplate, string>> = {
  quick20: '0a1b2c3d-0020-4a20-9020-000000000020',
  standard50: '0a1b2c3d-0050-4a50-9050-000000000050',
  full100: '0a1b2c3d-0100-4a10-9100-000000000100',
};

/** Every human readable string on a stock sheet. */
export interface TemplateText {
  /** Printed on the right edge so a teacher can tell two sheets apart by eye. */
  readonly name: string;
  /** Vertical text on the left edge, normally the product name. */
  readonly branding: string;
  readonly studentName: string;
  readonly studentId: string;
  readonly keyVersion: string;
}

/**
 * Same bubble, closer rows. A hundred questions plus an id grid does not fit a
 * page at the default row pitch, and the choice is between a smaller bubble and
 * closer rows. Closer rows win: the bubble is what the scanner measures, while
 * row spacing costs only a little reading comfort.
 */
const DENSE: BubbleMetrics = { ...DEFAULT_BUBBLE, pitchYMm: 6, gridPitchYMm: 5.4 };

interface Shape {
  readonly questions: number;
  readonly choices: number;
  readonly bubble: BubbleMetrics;
  /** A key version grid is only worth its width once cheating is worth deterring. */
  readonly keyVersions: boolean;
}

const SHAPE: Readonly<Record<StockTemplate, Shape>> = {
  quick20: { questions: 20, choices: 4, bubble: DEFAULT_BUBBLE, keyVersions: false },
  standard50: { questions: 50, choices: 5, bubble: DEFAULT_BUBBLE, keyVersions: true },
  full100: { questions: 100, choices: 5, bubble: DENSE, keyVersions: false },
};

export function stockTemplate(
  kind: StockTemplate,
  text: TemplateText,
  family: PaperFamily = 'A',
): SheetSpec {
  const shape = SHAPE[kind];

  const withoutPaper: Omit<SheetSpecInput, 'paper'> = {
    templateId: TEMPLATE_ID[kind],
    version: 3,
    name: text.name,
    branding: text.branding,
    columns: 'auto',
    questions: Array.from({ length: shape.questions }, () => ({
      kind: 'choice',
      symbols: [...latinSymbols(shape.choices)],
    })),
    headerFields: [
      {
        id: 'studentName',
        usage: 'studentName',
        label: text.studentName,
        kind: 'writtenBox',
        width: 'large',
      },
      {
        id: 'studentId',
        usage: 'studentId',
        label: text.studentId,
        kind: 'bubbleGrid',
        length: 4,
        symbols: [...digitSymbols()],
      },
      ...(shape.keyVersions
        ? [
            {
              id: 'keyVersion',
              usage: 'keyVersion' as const,
              label: text.keyVersion,
              kind: 'bubbleGrid' as const,
              length: 1,
              symbols: ['A', 'B', 'C', 'D'],
            },
          ]
        : []),
    ],
    bubble: shape.bubble,
  };

  // The smallest paper that holds it, so a twenty question quiz is a small
  // sheet and a hundred question exam is a full page, rather than every sheet
  // being a full page with the bottom half empty.
  const choice = smallestPaper(withoutPaper, family);
  if (choice === null) {
    throw new Error(`stock template ${kind} fits no paper, which is a bug in its shape`);
  }
  return SheetSpecSchema.parse({ ...withoutPaper, paper: choice.paper });
}

/** How many questions each stock sheet holds, for a picker to show. */
export function stockQuestionCount(kind: StockTemplate): number {
  return SHAPE[kind].questions;
}
