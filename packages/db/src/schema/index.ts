// Every table in the database, and the list is the point.
//
// Nine tables, and the two that are NOT here are as deliberate as the nine that
// are: no `responses` table, because the answers are one string per paper, and
// no table anywhere holding a maximum, a count or a flag that can be derived
// from what is already stored.
//
// Drizzle Kit reads this module to write the migrations, so a table that is not
// exported here does not exist.

export { orgs } from './orgs';
export { users } from './users';
export { consents } from './consents';
export { templates } from './templates';
export { exams } from './exams';
export { answerKeys } from './answer-keys';
export { students } from './students';
export { usage } from './usage';
export { scans } from './scans';
