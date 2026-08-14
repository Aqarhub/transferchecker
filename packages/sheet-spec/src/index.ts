// Public surface of the sheet specification package.

export { GEOMETRY, PAPER, PAPER_NAMES } from './paper';
export type { PaperName, PaperSize } from './paper';

export {
  ALPHABET_NAMES,
  CHOICE_LABEL_NAMES,
  MAX_CHOICES,
  alphabetSymbols,
  choiceSymbols,
} from './alphabet';
export type { AlphabetName, ChoiceLabelName } from './alphabet';

export {
  BubbleGridFieldSchema,
  BubbleMetricsSchema,
  DEFAULT_BUBBLE,
  HeaderFieldSchema,
  SheetSpecSchema,
  WrittenBoxFieldSchema,
} from './spec';
export type {
  BubbleGridField,
  BubbleMetrics,
  HeaderField,
  SheetSpec,
  SheetSpecInput,
  WrittenBoxField,
} from './spec';

export { layoutSheet } from './layout/index';
export { columnWidthMm } from './layout/grid';

export { bubbleGroups, fieldGroupId, questionGroupId } from './groups';

export type {
  Bubble,
  BubbleGroup,
  GridFieldColumn,
  GridFieldLayout,
  LayoutResult,
  OverflowArea,
  Point,
  QuestionColumn,
  QuestionRow,
  Rect,
  SheetLayout,
  VerticalText,
  WrittenBoxLayout,
} from './types';
