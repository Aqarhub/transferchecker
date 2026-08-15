// Public surface of the grading package.
//
// It sits between `core-omr`, which returns a structure and refuses to return a
// score, and whatever owns storage. `CORE-OMR.md` section 9 says the engine
// leaves the answer string to whoever owns the storage decision, and this is
// that owner: the encoding, the key, and the arithmetic, in one place with no
// user interface and no database anywhere near it.

export {
  BLANK,
  UNRESOLVED,
  blank,
  decodeAnswers,
  encodeAnswer,
  encodeAnswers,
  indexChar,
  sameAnswers,
  unresolved,
} from './answers';
export type { Answer } from './answers';

export {
  AnswerKeySchema,
  AwardSchema,
  QuestionKeySchema,
  fromStored,
  maxPointsOf,
  pointsFor,
  toStored,
  totalPointsOf,
  unkeyed,
} from './key';
export type { AnswerKey, Award, QuestionKey, StoredKey } from './key';

export { gradeAnswers, gradeStored } from './grade';
export type { Grade, QuestionGrade } from './grade';

export { answerOf, answersOf, marksReview } from './read';
