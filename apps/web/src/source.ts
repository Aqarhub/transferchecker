// Where the dashboard's rows come from when there is no server yet.
//
// A PostgreSQL is started inside this process, the real migrations are applied
// to it, and one organisation is seeded. The build then reads it with the same
// queries a hosted dashboard will run, so the pages that come out are a snapshot
// of a database rather than a rendering of constants.
//
// WHAT IS REAL HERE AND WHAT IS NOT, SAID PLAINLY. The path is real: schema,
// migration, policy, index, query, decode, grade. The CONTENT is a seeded demo
// organisation, because there is no server and no teacher yet. Swapping it for a
// hosted database is one function: build a Drizzle client over a connection and
// hand it to `loadDashboard`, which does not know or care which engine answered.

import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { drizzle } from 'drizzle-orm/pglite';
import { seedDemo } from '@transferchecker/db';
import { prepare } from '@transferchecker/db/local';
import { loadDashboard } from './data';
import type { Dashboard } from './data';

/** The demo organisation's identifiers, fixed so two builds are identical. */
export const DEMO = {
  orgId: '11111111-1111-4111-8111-111111111111',
  userId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  examId: 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee',
  templateId: 'dddddddd-1111-4111-8111-dddddddddddd',
} as const;

export async function demoDashboard(): Promise<Dashboard> {
  const client = await PGlite.create({ extensions: { citext } });
  await prepare(client);
  const db = drizzle(client);
  await seedDemo(db, DEMO);
  const dashboard = await loadDashboard(db, DEMO.orgId, DEMO.examId);
  if (dashboard === null) throw new Error('the seeded exam did not come back out of the database');
  return dashboard;
}
