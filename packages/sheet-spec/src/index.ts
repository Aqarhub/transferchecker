// Public surface of the sheet specification package.

export { FIELD_WIDTH_MM, GEOMETRY, PAPER, PAPER_NAMES } from './paper';
export type { PaperName, PaperSize } from './paper';

export {
  MAX_SYMBOLS,
  arabicSymbols,
  digitSymbols,
  latinSymbols,
  trueFalseSymbols,
} from './alphabet';

export {
  BubbleGridFieldSchema,
  BubbleMetricsSchema,
  ChoiceQuestionSchema,
  DEFAULT_BUBBLE,
  FIELD_USAGES,
  FIELD_WIDTHS,
  HeaderFieldSchema,
  LABEL_PLACEMENTS,
  QuestionSchema,
  SELECT_MODES,
  SHEET_CODES,
  SheetSpecSchema,
  WrittenBoxFieldSchema,
} from './spec';
export type {
  BubbleGridField,
  BubbleMetrics,
  ChoiceQuestion,
  FieldUsage,
  FieldWidth,
  HeaderField,
  LabelPlacement,
  Question,
  SelectMode,
  SheetCodeMode,
  SheetSpec,
  SheetSpecInput,
  WrittenBoxField,
} from './spec';

export {
  CODE_FORMAT,
  base32Decode,
  base32Encode,
  codeMatrix,
  decodeSheetBytes,
  decodeSheetCode,
  encodeSheetBytes,
  encodeSheetCode,
} from './code/index';
export type { DecodedCode, QrMatrix } from './code/index';

export { layoutSheet } from './layout/index';
export { columnWidthMm, questionWidthMm, resolveColumns } from './layout/grid';

export { bubbleGroups, fieldGroupId, questionGroupId } from './groups';

export type {
  Bubble,
  ChoiceLabel,
  BubbleGroup,
  GridFieldColumn,
  GridFieldLayout,
  LayoutResult,
  OverflowArea,
  Point,
  QuestionColumn,
  QuestionRow,
  Rect,
  SheetCodeLayout,
  SheetLayout,
  VerticalText,
  WrittenBoxLayout,
} from './types';
