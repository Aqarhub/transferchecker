// Scoping a request, and the leak that would never announce itself.
//
// The policies were checked in rls.test.ts by setting the claim by hand. This
// checks the thing the application will actually call, because a correct policy
// reached through a wrong session is not a correct anything.

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asAnonymous, asTenant } from '../src/tenant';
import { settingsFromEnv } from '../src/connect';
import { scans } from '../src/schema/scans';
import type { Database } from '../src/database';
import { ORG_A, ORG_B, USER_A, USER_B, freshDatabase, rows } from './harness';

let client: PGlite;
let db: Database;

// Through the query builder rather than raw SQL, because that is what the
// application uses and because `execute` returns a different shape per driver.
const orgsSeen = async (tx: Database): Promise<string[]> => {
  const found = await tx.select({ orgId: scans.orgId }).from(scans);
  return found.map((row) => row.orgId);
};

const count = async (tx: Database): Promise<number> => (await orgsSeen(tx)).length;

beforeAll(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  db = harness.db;
  await client.exec(`
    insert into orgs (id, owner_id) values ('${ORG_A}','${USER_A}'), ('${ORG_B}','${USER_B}');
    insert into users (id, org_id, email, locale, country) values
      ('${USER_A}','${ORG_A}','a@example.sa','ar','SA'),
      ('${USER_B}','${ORG_B}','b@example.ae','ar','AE');
    insert into templates (id, org_id, spec) values
      ('dddddddd-1111-4111-8111-dddddddddddd','${ORG_A}','{}'),
      ('dddddddd-2222-4222-8222-dddddddddddd','${ORG_B}','{}');
    insert into exams (id, org_id, title, template_id, form_count) values
      ('eeeeeeee-1111-4111-8111-eeeeeeeeeeee','${ORG_A}','A','dddddddd-1111-4111-8111-dddddddddddd',1),
      ('eeeeeeee-2222-4222-8222-eeeeeeeeeeee','${ORG_B}','B','dddddddd-2222-4222-8222-dddddddddddd',1);
    insert into scans (id, org_id, exam_id, student_ext_id, answers, marks, score, total, device_id, client_ts) values
      ('88888888-1111-4111-8111-888888888888','${ORG_A}','eeeeeeee-1111-4111-8111-eeeeeeeeeeee','1','012','ccc',3,3,'d',now()),
      ('88888888-2222-4222-8222-888888888888','${ORG_B}','eeeeeeee-2222-4222-8222-eeeeeeeeeeee','1','210','ccc',3,3,'d',now());
  `);
});

describe('a scoped request', () => {
  it('sees its own organisation and only its own', async () => {
    expect(await asTenant(db, { userId: USER_A, orgId: ORG_A }, count)).toBe(1);
    expect(await asTenant(db, { userId: USER_B, orgId: ORG_B }, count)).toBe(1);
  });

  it('gives each organisation a different row, not the same one twice', async () => {
    expect(await asTenant(db, { userId: USER_A, orgId: ORG_A }, orgsSeen)).toEqual([ORG_A]);
    expect(await asTenant(db, { userId: USER_B, orgId: ORG_B }, orgsSeen)).toEqual([ORG_B]);
  });

  // `anon` holds no privilege on any table, so this is refused before a policy
  // is ever consulted. rls.test.ts checks the privilege itself; this checks that
  // the path an application would take runs into it.
  it('shows an anonymous caller nothing at all', async () => {
    await expect(asAnonymous(db, count)).rejects.toThrow();
  });
});

// THE ONE THAT MATTERS. A pool hands the same connection to the next request. If
// the role or the claim outlived the transaction, request two would arrive
// carrying request one's organisation and read another school's marks with every
// policy working exactly as written, and nothing anywhere would raise an error.
describe('the leak a connection pool would make', () => {
  it('leaves no organisation behind for the next request on the same connection', async () => {
    await asTenant(db, { userId: USER_A, orgId: ORG_A }, count);

    const leaked = await rows<{ claims: string; who: string }>(
      client,
      `select current_setting('request.jwt.claims', true) as claims, current_user as who`,
    );
    expect(leaked[0]?.claims ?? '').toBe('');
    expect(leaked[0]?.who).not.toBe('authenticated');
  });

  it('does not let one organisation read the next one rows in sequence', async () => {
    await asTenant(db, { userId: USER_A, orgId: ORG_A }, count);
    expect(await asTenant(db, { userId: USER_B, orgId: ORG_B }, orgsSeen)).toEqual([ORG_B]);
  });

  it('reverts even when the work throws', async () => {
    await expect(
      asTenant(db, { userId: USER_A, orgId: ORG_A }, () =>
        Promise.reject(new Error('the request failed')),
      ),
    ).rejects.toThrow('the request failed');

    const after = await rows<{ who: string }>(client, 'select current_user as who');
    expect(after[0]?.who).not.toBe('authenticated');
  });
});

describe('the settings a deployment needs', () => {
  it('lists everything that is missing, rather than the first one', () => {
    expect(settingsFromEnv({})).toEqual({
      ok: false,
      missing: ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'],
    });
  });

  // Opt out rather than opt in. A default that has to be remembered is a default
  // that is forgotten the day somebody sets up a second environment.
  it('turns TLS on unless it is explicitly disabled', () => {
    const base = { PGHOST: 'h', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p' };
    const on = settingsFromEnv(base);
    expect(on.ok && on.settings.ssl).toBe(true);
    const off = settingsFromEnv({ ...base, PGSSL: 'disable' });
    expect(off.ok && off.settings.ssl).toBe(false);
  });

  it('treats an empty variable as missing, not as a value', () => {
    const found = settingsFromEnv({ PGHOST: '', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p' });
    expect(found).toEqual({ ok: false, missing: ['PGHOST'] });
  });

  it('defaults to the direct connection, since migrations may not use a pooler', () => {
    const found = settingsFromEnv({ PGHOST: 'h', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p' });
    expect(found.ok && found.settings.pooled).toBe(false);
    expect(found.ok && found.settings.port).toBe(5432);
  });
});
