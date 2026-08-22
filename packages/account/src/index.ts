// The account layer: who a person is, where they are, and what they agreed to.
//
// Pure logic, no database, no network and no clock. Every time is a parameter
// and every lookup is passed in, which is what lets the rules that matter here
// be tested exhaustively rather than sampled: a refresh token state machine and
// a consent record are both things whose interesting behaviour is at the edges.

export {
  COUNTRIES,
  NOT_OFFERED,
  REGIME_LAW,
  audienceOf,
  countryName,
  regimeOf,
  slugOf,
} from './countries';
export type { Audience, Regime } from './countries';

export {
  MAX_LENGTH,
  MIN_LENGTH,
  checkPassword,
  hibpQuery,
  isBreached,
  normalise,
} from './password';
export type { HibpQuery, PasswordCheck, PasswordProblem } from './password';

export { EmailSchema, SignupSchema, checkSignup } from './signup';
export type { Accepted, SignupContext, SignupProblem, SignupRequest, SignupResult } from './signup';

export { familyMembers, refresh, rotate } from './session';
export type { Family, RefreshInput, RefreshOutcome, RefusalReason, TokenRecord } from './session';

export { BASE_DELAY_MS, FREE_ATTEMPTS, MAX_DELAY_MS, checkLogin, delayAfter } from './login';
export type { Attempts, LoginInput, LoginOutcome, LoginRefusal } from './login';

export {
  ACCESS_LIFETIME_MS,
  AUDIENCE,
  CLOCK_TOLERANCE_MS,
  ISSUER,
  accessClaims,
  issueAccessToken,
  verifyAccessToken,
} from './token';
export type { AccessInput, SigningKey, VerifyOutcome, VerifyRefusal } from './token';

export { CONFIRMATION_LIFETIME_MS, confirmationFresh } from './confirmation';

export { ConsentSchema, PolicyVersionSchema, consentFor, isCurrent, outstanding } from './consent';
export type { Consent } from './consent';
