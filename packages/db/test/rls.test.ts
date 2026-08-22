// Row level isolation, checked by PostgreSQL rather than by reading the SQL.
//
// PLAN.md section 7: "integration tests that try to read another org's data and
// confirm they fail. One leak is the end of the project." That sentence is what
// this file is. A real engine boots, the real migrations are applied to it, and
// then an ordinary authenticated client goes looking for a neighbour's rows in
// every way a client can: reading them, writing into their organisation, moving
// its own rows across, deleting theirs, and arriving with no organisation at all.

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { actAs, actAsOwner } from '../src/local';
import { ORG_A, ORG_B, USER_A, USER_B, freshDatabase, rows } from './harness';

let client: PGlite;

/** How many tables exist in total, including the two the session tests own. */
const ALL_TABLES = 13;

/**
 * The tables scoped by plain organisation isolation, and the column each uses.
 *
 * `token_families` is scoped tighter than an organisation, to a person, and
 * `refresh_tokens`, `credentials` and `login_attempts` are reachable by nobody
 * at all. They are covered in session.test.ts and credentials.test.ts.
 */
const TABLES: readonly (readonly [string, string])[] = [
  ['orgs', 'id'],
  ['users', 'org_id'],
  ['consents', 'org_id'],
  ['templates', 'org_id'],
  ['exams', 'org_id'],
  ['answer_keys', 'org_id'],
  ['students', 'org_id'],
  ['usage', 'org_id'],
  ['scans', 'org_id'],
];

const TEMPLATE_A = 'dddddddd-1111-4111-8111-dddddddddddd';
const TEMPLATE_B = 'dddddddd-2222-4222-8222-dddddddddddd';
const EXAM_A = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
const EXAM_B = 'eeeeeeee-2222-4222-8222-eeeeeeeeeeee';

/** Two complete organisations, written as the owner so both really exist. */
async function seedTwoOrgs(target: PGlite): Promise<void> {
  await target.exec(`
    insert into orgs (id, owner_id) values
      ('${ORG_A}', '${USER_A}'), ('${ORG_B}', '${USER_B}');
    insert into users (id, org_id, email, locale, country) values
      ('${USER_A}', '${ORG_A}', 'a@example.sa', 'ar', 'SA'),
      ('${USER_B}', '${ORG_B}', 'b@example.ae', 'ar', 'AE');
    insert into consents (id, org_id, user_id, document, regime, country, language, version, at) values
      ('cccccccc-1111-4111-8111-cccccccccccc', '${ORG_A}', '${USER_A}', 'privacy', 'sa', 'SA', 'ar', '2026-08-16', now()),
      ('cccccccc-2222-4222-8222-cccccccccccc', '${ORG_B}', '${USER_B}', 'privacy', 'ae', 'AE', 'ar', '2026-08-16', now());
    insert into templates (id, org_id, spec) values
      ('${TEMPLATE_A}', '${ORG_A}', '{}'), ('${TEMPLATE_B}', '${ORG_B}', '{}');
    insert into exams (id, org_id, title, template_id, form_count) values
      ('${EXAM_A}', '${ORG_A}', 'A', '${TEMPLATE_A}', 1),
      ('${EXAM_B}', '${ORG_B}', 'B', '${TEMPLATE_B}', 1);
    insert into answer_keys (id, org_id, exam_id, form_code, key, points, extras, tags) values
      ('ffffffff-1111-4111-8111-ffffffffffff', '${ORG_A}', '${EXAM_A}', 'A', '012', '{1,1,1}', '{}', '{}'),
      ('ffffffff-2222-4222-8222-ffffffffffff', '${ORG_B}', '${EXAM_B}', 'A', '210', '{1,1,1}', '{}', '{}');
    insert into students (id, org_id, ext_id, name) values
      ('99999999-1111-4111-8111-999999999999', '${ORG_A}', '00007', 'A pupil'),
      ('99999999-2222-4222-8222-999999999999', '${ORG_B}', '00007', 'B pupil');
    insert into usage (org_id, month, papers_graded) values
      ('${ORG_A}', '2026-08-01', 12), ('${ORG_B}', '2026-08-01', 34);
    insert into scans (id, org_id, exam_id, student_ext_id, answers, marks, score, total, device_id, client_ts) values
      ('88888888-1111-4111-8111-888888888888', '${ORG_A}', '${EXAM_A}', '00007', '012', 'ccc', 3, 3, 'd', now()),
      ('88888888-2222-4222-8222-888888888888', '${ORG_B}', '${EXAM_B}', '00007', '210', 'ccc', 3, 3, 'd', now());
  `);
}

beforeAll(async () => {
  const harness = await freshDatabase();
  client = harness.client;
  await seedTwoOrgs(client);
});

describe('the database refuses to be the only line of defence it is not', () => {
  it('has row level security enabled on every single table', async () => {
    await actAsOwner(client);
    const found = await rows<{ relname: string; relrowsecurity: boolean }>(
      client,
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    );
    expect(found).toHaveLength(ALL_TABLES);
    for (const table of found)
      expect([table.relname, table.relrowsecurity]).toEqual([table.relname, true]);
  });

  // Every table but one. `refresh_tokens` has security enabled and NO policy,
  // which in PostgreSQL denies every row to every client, and that is the whole
  // design rather than an omission: nothing a signed in client does needs to
  // read a refresh token. The test names it so the absence cannot be mistaken
  // for a table somebody forgot.
  it('gives every table exactly the policies the two-role model names', async () => {
    await actAsOwner(client);
    const found = await rows<{ tablename: string; roles: string; cmd: string }>(
      client,
      `select tablename, roles::text as roles, cmd from pg_policies where schemaname = 'public'`,
    );
    // Two hats, two fences. Tenant policies stand where they always did, and
    // migration 0006 adds the auth service's own on the tables auth work
    // touches. The three secret tables still carry NO tenant policy: what
    // changed is that the auth service is now somebody, not that a client is.
    const tenant = found.filter((policy) => policy.roles === '{authenticated}');
    const service = found.filter((policy) => policy.roles === '{tc_auth}');
    expect(found).toHaveLength(tenant.length + service.length);
    expect([...tenant.map((policy) => policy.tablename)].sort()).toEqual(
      [...TABLES.map(([name]) => name), 'token_families'].sort(),
    );
    expect([...service.map((policy) => policy.tablename)].sort()).toEqual([
      'consents',
      'credentials',
      'login_attempts',
      'orgs',
      'refresh_tokens',
      'token_families',
      'users',
    ]);
    for (const unreachable of ['refresh_tokens', 'credentials', 'login_attempts']) {
      expect(tenant.map((policy) => policy.tablename)).not.toContain(unreachable);
    }
    for (const policy of found)
      expect([policy.tablename, policy.cmd]).toEqual([policy.tablename, 'ALL']);
  });

  // The single most dangerous line in the schema. `user_metadata` is writable by
  // the user through the auth API, so a policy that read it would let anybody
  // assign themselves any organisation.
  it('reads the organisation from app_metadata and never from user_metadata', async () => {
    await actAsOwner(client);
    const found = await rows<{ qual: string; with_check: string }>(
      client,
      // Tenant policies only: the auth role's `using (true)` is its documented
      // shape and reads no claim at all.
      `select qual, with_check from pg_policies
       where schemaname = 'public' and roles::text = '{authenticated}'`,
    );
    for (const policy of found) {
      expect(policy.qual).toContain('app_metadata');
      expect(policy.qual).not.toContain('user_metadata');
      // The write rule is written down rather than inherited from the read
      // rule. On a `for all` policy PostgreSQL falls back to `using` when
      // `with check` is absent, so this is not what refuses a cross
      // organisation insert today. It is what keeps refusing it on the day the
      // read rule is widened. See the note in src/policy.ts.
      expect(policy.with_check).toContain('app_metadata');
    }
  });
});

describe('reading another organisation', () => {
  it('returns nothing, from every table, without raising an error', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    for (const [table, column] of TABLES) {
      const mine = await rows<{ n: number }>(client, `select count(*)::int as n from "${table}"`);
      const theirs = await rows<{ n: number }>(
        client,
        `select count(*)::int as n from "${table}" where "${column}" = '${ORG_B}'`,
      );
      expect([table, mine[0]?.n]).toEqual([table, 1]);
      expect([table, theirs[0]?.n]).toEqual([table, 0]);
    }
  });

  it('hides the row even when its primary key is known exactly', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    const found = await rows(
      client,
      `select * from scans where id = '88888888-2222-4222-8222-888888888888'`,
    );
    expect(found).toEqual([]);
  });

  // A caller with a valid token but no organisation claim is the state a bug in
  // the access token hook would produce. It must see nothing rather than
  // everything.
  it('shows nothing at all to a token carrying no organisation', async () => {
    await actAs(client, { userId: USER_A });
    for (const [table] of TABLES) {
      const found = await rows<{ n: number }>(client, `select count(*)::int as n from "${table}"`);
      expect([table, found[0]?.n]).toEqual([table, 0]);
    }
  });

  // The attack the policy comment names. A user can write their own
  // `user_metadata`, so a token claiming an organisation there must buy nothing.
  it('ignores an organisation claimed in user_metadata', async () => {
    await client.query('select set_config($1, $2, false)', [
      'request.jwt.claims',
      JSON.stringify({ role: 'authenticated', sub: USER_A, user_metadata: { org_id: ORG_B } }),
    ]);
    await client.exec('set role authenticated');
    const found = await rows<{ n: number }>(client, 'select count(*)::int as n from scans');
    expect(found[0]?.n).toBe(0);
  });
});

describe('writing into another organisation', () => {
  it('refuses an insert carrying another organisation id', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    await expect(
      client.exec(
        `insert into scans (id, org_id, exam_id, student_ext_id, answers, marks, score, total, device_id, client_ts)
         values ('77777777-1111-4111-8111-777777777777', '${ORG_B}', '${EXAM_B}', '1', '012', 'ccc', 3, 3, 'd', now())`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  // The subtle one, and the reason a read only test would not have found it:
  // the row is visible and updatable, and what is refused is where the updated
  // version of it lands.
  it('refuses to move one of its own rows across', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    await expect(
      client.exec(`update scans set org_id = '${ORG_B}' where org_id = '${ORG_A}'`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('updates nothing when it aims at another organisation rows', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    await client.exec(`update scans set marks = 'xxx' where org_id = '${ORG_B}'`);
    await actAsOwner(client);
    const found = await rows<{ marks: string }>(
      client,
      `select marks from scans where org_id = '${ORG_B}'`,
    );
    expect(found[0]?.marks).toBe('ccc');
  });

  it('deletes nothing when it aims at another organisation rows', async () => {
    await actAs(client, { orgId: ORG_A, userId: USER_A });
    await client.exec(`delete from scans where org_id = '${ORG_B}'`);
    await actAsOwner(client);
    const found = await rows<{ n: number }>(
      client,
      `select count(*)::int as n from scans where org_id = '${ORG_B}'`,
    );
    expect(found[0]?.n).toBe(1);
  });
});

describe('the privileges under the policies', () => {
  // Every row in this database belongs to an organisation, and a caller with no
  // token belongs to none. There is no query anon should be able to ask.
  it('gives an anonymous caller no privilege on any table', async () => {
    await actAsOwner(client);
    const found = await rows<{ n: number }>(
      client,
      `select count(*)::int as n from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(found[0]?.n).toBe(0);
  });

  // A consent log the consenting party can rewrite is not evidence of anything.
  // This is a privilege rather than a policy, which is why the policy tests
  // above would not have caught it.
  it('lets a signed in client add a consent and never edit or remove one', async () => {
    await actAsOwner(client);
    const found = await rows<{ privilege_type: string }>(
      client,
      `select privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_name = 'consents'`,
    );
    const granted = found.map((grant) => grant.privilege_type);
    expect([...granted].sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('does not let a signed in client rename or delete its own organisation', async () => {
    await actAsOwner(client);
    const found = await rows<{ privilege_type: string }>(
      client,
      `select privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_name = 'orgs'`,
    );
    expect(found.map((grant) => grant.privilege_type)).toEqual(['SELECT']);
  });
});
