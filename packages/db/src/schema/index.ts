// Every table in the database, and the list is the point.
//
// Fifteen tables, and what is NOT here is as deliberate as what is: no
// `responses` table, because the answers are one string per paper, and no table
// anywhere holding a maximum, a count or a flag that can be derived from what is
// already stored.
//
// The last five are the ones the plan did not draw, and it was right not to:
// it assumed an auth provider would hold the sessions, the passwords and the
// confirmation mail. The database this runs on holds none of them, so the
// refresh token state machine, the password rules and the mailbox rules that
// `packages/account` proves have somewhere to live.
//
// Four of the fourteen are reachable by nobody: `refresh_tokens`, `credentials`,
// `login_attempts` and `email_verifications` carry no policy and no privilege
// for any client role, because a token, a password hash, a failure counter and
// an unclicked link are things the server handles and a signed in teacher has no
// business reading.
//
// ONLY TABLES BELONG IN THIS MODULE. Drizzle Kit reads every export here as a
// table when it writes the migrations, and so do the schema tests.

export { orgs } from './orgs';
export { users } from './users';
export { consents } from './consents';
export { templates } from './templates';
export { exams } from './exams';
export { answerKeys } from './answer-keys';
export { students } from './students';
export { usage } from './usage';
export { scans } from './scans';
export { refreshTokens, tokenFamilies } from './sessions';
export { credentials, loginAttempts } from './credentials';
export { emailVerifications } from './verifications';
export { deletions } from './deletions';
