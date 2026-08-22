// The deployment check, checked.
//
// `verify` is the thing that will be run against a production database, so the
// one thing that must not happen is a green report on a database that is not
// safe. These run the same checks against an engine here, first as the
// migrations leave it and then after breaking each protection in turn.

import { describe, expect, it } from 'vitest';
import { auditIsolation, probeIsolation } from '../src/audit';
import { freshDatabase, rows } from './harness';

describe('a database the migrations built', () => {
  it('passes every check', async () => {
    const { client, db } = await freshDatabase();
    const checks = [...(await auditIsolation(db)), await probeIsolation(db)];
    const failed = checks.filter((check) => !check.ok);
    expect(failed.map((check) => `${check.name}: ${check.detail}`)).toEqual([]);
    expect(checks.length).toBeGreaterThan(8);

    // The probe wrote two organisations and rolled them back. A production
    // database must be left exactly as it was found.
    const left = await rows<{ n: number }>(client, 'select count(*)::int as n from orgs');
    expect(left[0]?.n).toBe(0);
  });
});

describe('a database somebody has broken', () => {
  it('notices a policy dropped at midnight', async () => {
    const { client, db } = await freshDatabase();
    await client.exec('drop policy scans_isolation on scans');
    const checks = await auditIsolation(db);
    expect(checks.find((check) => check.name.includes('exactly the roles'))?.ok).toBe(false);
  });

  it('notices an auth policy dropped, which is the same model from the other side', async () => {
    const { client, db } = await freshDatabase();
    await client.exec('drop policy credentials_auth on credentials');
    const checks = await auditIsolation(db);
    const check = checks.find((entry) => entry.name.includes('exactly the roles'));
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('credentials');
  });

  it('notices a policy quietly widened to a role the model does not name', async () => {
    const { client, db } = await freshDatabase();
    await client.exec(`create policy scans_extra on scans as permissive for all to tc_auth
      using (true) with check (true)`);
    const checks = await auditIsolation(db);
    const check = checks.find((entry) => entry.name.includes('exactly the roles'));
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('scans');
  });

  it('notices the auth role being granted grading data', async () => {
    const { client, db } = await freshDatabase();
    await client.exec('grant select on scans to tc_auth');
    const checks = await auditIsolation(db);
    const check = checks.find((entry) => entry.name.includes('nothing on grading'));
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('scans');
  });

  it('notices row level security turned off', async () => {
    const { client, db } = await freshDatabase();
    await client.exec('alter table scans disable row level security');
    const checks = await auditIsolation(db);
    expect(checks.find((check) => check.name.includes('row level security'))?.ok).toBe(false);
  });

  // The one that would hand every organisation to anybody who asked.
  it('notices a policy rewritten to trust user_metadata', async () => {
    const { client, db } = await freshDatabase();
    await client.exec(`
      drop policy scans_isolation on scans;
      create policy scans_isolation on scans as permissive for all to authenticated
        using (org_id = (select ((auth.jwt() -> 'user_metadata') ->> 'org_id')::uuid));
    `);
    const checks = await auditIsolation(db);
    expect(checks.find((check) => check.name.includes('app_metadata'))?.ok).toBe(false);
  });

  // The three tables a client must never reach: a token, a password hash and a
  // failure counter. Granting any one of them is caught by the same check.
  it.each(['refresh_tokens', 'credentials', 'login_attempts'])(
    'notices %s being granted to a signed in client',
    async (table) => {
      const { client, db } = await freshDatabase();
      await client.exec(`grant select on ${table} to authenticated`);
      const checks = await auditIsolation(db);
      const check = checks.find((entry) => entry.name.includes('token, a password'));
      expect(check?.ok).toBe(false);
      expect(check?.detail).toContain(table);
    },
  );

  it('notices anything granted to an anonymous caller', async () => {
    const { client, db } = await freshDatabase();
    await client.exec('grant select on scans to anon');
    const checks = await auditIsolation(db);
    expect(checks.find((check) => check.name.includes('anonymous'))?.ok).toBe(false);
  });

  // The probe is the only check that would catch a policy which is present,
  // correctly worded, and still wrong about which rows it admits.
  it('notices a policy widened to admit every row', async () => {
    const { client, db } = await freshDatabase();
    await client.exec(`
      drop policy orgs_isolation on orgs;
      create policy orgs_isolation on orgs as permissive for all to authenticated
        using (true) with check (true);
      grant insert on orgs to authenticated;
    `);
    const probe = await probeIsolation(db);
    expect(probe.ok).toBe(false);
    expect(probe.detail).toContain('neighbour 1');
  });
});
