// Every table in the database, and the list is the point.
//
// Eleven tables, and what is NOT here is as deliberate as what is: no
// `responses` table, because the answers are one string per paper, and no table
// anywhere holding a maximum, a count or a flag that can be derived from what is
// already stored.
//
// The last two are the ones the plan did not draw. It assumed Supabase would
// hold the sessions; the database this runs on does not, so the refresh token
// state machine that `packages/account` proves has somewhere to live.
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
