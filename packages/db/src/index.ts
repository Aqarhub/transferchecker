// The database layer: nine tables, one isolation rule, and no business logic.
//
// What this package owns is the schema, the migrations that build it, the
// policies that keep one organisation out of another's rows, and the reads the
// dashboard needs. What it does not own is any rule that already has a home:
// the answer encoding is `packages/grading`, the account rules are
// `packages/account`, and neither is restated here.

export * as schema from './schema/index';

export { citext } from './columns';
export { CURRENT_ORG, isolate, isolateBy } from './policy';

export type { Database } from './database';

export { keyOf, keyRow } from './keys';
export type { AnswerKeyRow, NewAnswerKeyRow } from './keys';

export { declaredForm, storedForm } from './form';

export { examDataOf, examsOf, rosterOf } from './queries';
export type { ExamData, ExamSummary, ScanRecord } from './queries';

export { createAccount, planAccount } from './signup';

export { hashToken, refreshSession, revokeFamily, startSession } from './session';

export {
  ARGON2,
  DECOY_HASH,
  attemptLogin,
  beginConfirmation,
  confirmEmail,
  emailKey,
  forgetStaleAttempts,
  hashConfirmationToken,
  hashPassword,
  setPassword,
  verifyPassword,
} from './credentials';
export type { ConfirmOutcome, LoginAttempt, LoginResult } from './credentials';

export { auditIsolation, probeIsolation } from './audit';
export { diagnose, explain } from './diagnose';
export { assertUnprivileged } from './connect';
export type { Diagnosis } from './diagnose';
export type { Check } from './audit';

export { REQUEST_ROLE, asAnonymous, asTenant } from './tenant';
export type { Claims } from './tenant';
export type { RefreshInput, StartSession } from './session';

export { REVOCATIONS } from './schema/sessions';
export type { AccountPlan, AccountRows, LiveVersions, SignupIds } from './signup';

export { DEMO_KEY, seedDemo } from './seed';
export type { DemoIds } from './seed';

export { MAX_TIME, uuid7Source, uuidv7 } from './uuidv7';
export type { Uuid7Options } from './uuidv7';
