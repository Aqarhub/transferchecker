// Checking the isolation on whatever database you are actually pointed at.
//
// The test suite proves these properties against an engine that boots inside the
// test process. That is the right place to prove them and it is not the place
// they have to hold. A migration applied by hand, a privilege granted during an
// incident, a policy dropped to debug something at midnight: none of those
// appear in a green suite, and all of them appear here.
//
// TWO KINDS OF CHECK AND THE SECOND IS THE ONE THAT MATTERS. The catalogue
// checks read what the database SAYS: security on, policies present, privileges
// withheld. The probe finds out what it DOES, by writing two organisations,
// becoming an ordinary signed in client of one of them, counting what it can
// see, and rolling the whole thing back. Nothing is left behind and nothing is
// taken on trust.

import { sql } from 'drizzle-orm';
import type { Queryable } from './database';

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

const isRow = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * The rows out of a raw result, whichever driver answered.
 *
 * `execute` returns an array from one driver and `{ rows }` from another, and
 * this package deliberately does not know which one it is talking to.
 */
function rowsOf(result: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(result)) return result.filter(isRow);
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const inner: unknown = result.rows;
    if (Array.isArray(inner)) return inner.filter(isRow);
  }
  return [];
}

/**
 * One column as text, from a driver that types every value `unknown`.
 *
 * Written out rather than reaching for `String()`, which turns an object into
 * `[object Object]` and would make a failing check report nothing useful at the
 * exact moment somebody needs to read it.
 */
function text(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Every table, and the one that must have no policy at all. */
const UNREACHABLE = 'refresh_tokens';
const EXPECTED_TABLES = 11;

export async function auditIsolation(db: Queryable): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };

  const tables = rowsOf(
    await db.execute(sql`select relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`),
  );
  add(
    'every table is present',
    tables.length === EXPECTED_TABLES,
    `${String(tables.length)} tables`,
  );

  const unprotected = tables.filter((row) => text(row, 'relrowsecurity') !== 'true');
  add(
    'row level security is on for every table',
    unprotected.length === 0,
    unprotected.length === 0 ? 'all on' : unprotected.map((row) => text(row, 'relname')).join(', '),
  );

  const policies = rowsOf(
    await db.execute(sql`select tablename, roles::text as roles, cmd, qual, with_check
      from pg_policies where schemaname = 'public' order by tablename`),
  );
  const covered = new Set(policies.map((row) => text(row, 'tablename')));
  add(
    'every table has a policy except the one that must reach nobody',
    covered.size === EXPECTED_TABLES - 1 && !covered.has(UNREACHABLE),
    `${String(covered.size)} covered, ${UNREACHABLE} deliberately not`,
  );

  const wrongRole = policies.filter((row) => text(row, 'roles') !== '{authenticated}');
  add(
    'every policy applies to authenticated and to nobody else',
    wrongRole.length === 0,
    wrongRole.length === 0
      ? 'all authenticated'
      : wrongRole.map((r) => text(r, 'tablename')).join(', '),
  );

  // The single most dangerous thing that could be wrong. `user_metadata` is
  // writable by the user, so a policy reading it hands out any organisation.
  const badClaim = policies.filter(
    (row) =>
      !text(row, 'qual').includes('app_metadata') || text(row, 'qual').includes('user_metadata'),
  );
  add(
    'every policy reads app_metadata and never user_metadata',
    badClaim.length === 0,
    badClaim.length === 0
      ? 'all app_metadata'
      : badClaim.map((r) => text(r, 'tablename')).join(', '),
  );

  const anon = rowsOf(
    await db.execute(sql`select count(*)::int as n from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'`),
  );
  add(
    'an anonymous caller holds no privilege anywhere',
    text(anon[0] ?? {}, 'n') === '0',
    `${text(anon[0] ?? {}, 'n')} grants`,
  );

  const onTokens = rowsOf(
    await db.execute(sql`select count(*)::int as n from information_schema.role_table_grants
      where grantee = 'authenticated' and table_name = ${UNREACHABLE}`),
  );
  add(
    'a signed in client holds no privilege on the refresh tokens',
    text(onTokens[0] ?? {}, 'n') === '0',
    `${text(onTokens[0] ?? {}, 'n')} grants`,
  );

  const functions = rowsOf(
    await db.execute(sql`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'auth' order by proname`),
  );
  const names = functions.map((row) => text(row, 'proname'));
  add(
    'the claim functions every policy depends on exist',
    names.includes('jwt') && names.includes('uid'),
    names.join(', ') || 'none',
  );

  const extension = rowsOf(
    await db.execute(sql`select n.nspname from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace where e.extname = 'citext'`),
  );
  add(
    'citext is installed where the schema expects it',
    text(extension[0] ?? {}, 'nspname') === 'public',
    text(extension[0] ?? {}, 'nspname') || 'not installed',
  );

  return checks;
}

const ORG_ONE = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const ORG_TWO = '22222222-2222-4222-8222-bbbbbbbbbbbb';

/**
 * What the database DOES, proven on the database itself and then undone.
 *
 * Two organisations are written, the session becomes an ordinary signed in
 * client of the first, and it counts what it can reach. Everything happens
 * inside a transaction that is deliberately rolled back, so a production
 * database is left byte for byte as it was found.
 *
 * The role switch is the part that makes this meaningful. The account running
 * this owns the schema and, on managed PostgreSQL, may carry BYPASSRLS as well,
 * either of which would see both organisations no matter what the policies said.
 * `set local role` puts the session behind the same door a client stands at.
 */
export async function probeIsolation(db: Queryable): Promise<Check> {
  let seenOwn = -1;
  let seenOther = -1;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`insert into orgs (id, owner_id) values
        (${ORG_ONE}, ${ORG_ONE}), (${ORG_TWO}, ${ORG_TWO})`);
      await tx.execute(
        sql`select set_config('request.jwt.claims',
          ${JSON.stringify({ sub: ORG_ONE, role: 'authenticated', app_metadata: { org_id: ORG_ONE } })},
          true)`,
      );
      await tx.execute(sql.raw('set local role authenticated'));

      seenOwn = Number(
        text(
          rowsOf(
            await tx.execute(sql`select count(*)::int as n from orgs where id = ${ORG_ONE}`),
          )[0] ?? {},
          'n',
        ),
      );
      seenOther = Number(
        text(
          rowsOf(
            await tx.execute(sql`select count(*)::int as n from orgs where id = ${ORG_TWO}`),
          )[0] ?? {},
          'n',
        ),
      );

      // Undo everything. The probe is a question, not a change.
      throw new Error('rollback');
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'rollback') throw error;
  }

  const ok = seenOwn === 1 && seenOther === 0;
  return {
    name: 'a signed in client sees its own organisation and not its neighbour',
    ok,
    detail: `own ${String(seenOwn)} of 1, neighbour ${String(seenOther)} of 0`,
  };
}
