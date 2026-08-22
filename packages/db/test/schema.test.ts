// The schema's own shape, and the four decisions it exists to keep.
//
// These read the table definitions and the migration text. Nothing here connects
// to a database: what is being checked is what the schema SAYS, and the tests
// that check what PostgreSQL then DOES are in the other files.

import { getTableColumns, getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { migrationFiles } from '../src/local';
import * as schema from '../src/schema/index';

// Typed as the base table rather than as the union of nine specific ones, so
// `getTableColumns` resolves to one record type instead of nine.
const tables: readonly PgTable[] = Object.values(schema);
const named: Readonly<Record<string, PgTable>> = Object.fromEntries(
  tables.map((table) => [getTableName(table), table]),
);
const columnsOf = (table: PgTable): string[] =>
  Object.values(getTableColumns(table)).map((column) => column.name);

const migrations = await migrationFiles();
const sql = migrations.map((file) => file.sql).join('\n');

describe('the tables the plan asks for', () => {
  it('is exactly the thirteen, and the four extras are named for a reason', () => {
    expect([...Object.keys(named)].sort()).toEqual([
      'answer_keys',
      'consents',
      'credentials',
      'exams',
      'login_attempts',
      'orgs',
      'refresh_tokens',
      'scans',
      'students',
      'templates',
      'token_families',
      'usage',
      'users',
    ]);
  });

  // The plan drew nine because it assumed Supabase would hold the sessions. It
  // does not hold them here, so the refresh token state machine that
  // `packages/account` proves in memory has rows to act on.
  it('has somewhere to keep a session, since no auth provider is doing it', () => {
    expect(columnsOf(schema.tokenFamilies)).toContain('revoked_reason');
    expect(columnsOf(schema.refreshTokens)).toContain('used_at');
    expect(columnsOf(schema.credentials)).toContain('password_hash');
  });

  // The one table in the schema with no organisation, and it is deliberate: the
  // row is written before anybody is anybody, for an address that may have no
  // account, by a caller who has presented no token.
  it('gives the pre-authentication counter no organisation to belong to', () => {
    expect(columnsOf(schema.loginAttempts)).not.toContain('org_id');
    expect(columnsOf(schema.loginAttempts)).toContain('email_hash');
  });

  // The load bearing decision in PLAN.md section 5: a million teachers at a
  // hundred papers a month of fifty questions is five billion rows a month, and
  // not having them is where 95 percent of the size and the cost is saved.
  it('has no row per question anywhere', () => {
    expect(Object.keys(named)).not.toContain('responses');
    expect(sql).not.toMatch(/create table "?responses"?/i);
    // The answers are one string on the paper's own row.
    expect(columnsOf(schema.scans)).toContain('answers');
  });

  // Acceptance criterion 19 asks for the record back field for field "including
  // the marks string", and the first sketch of this schema did not have it.
  it('stores the marks string as its own column', () => {
    expect(columnsOf(schema.scans)).toContain('marks');
  });

  // `flags` was in the first sketch and was removed: the warning count is
  // derivable from `marks` in full, and storing the derived value is what opens
  // the door to two answers disagreeing.
  it('stores nothing that can be derived from what is already stored', () => {
    const every = tables.flatMap(columnsOf);
    expect(every).not.toContain('flags');
    expect(every).not.toContain('max_points');
    expect(every).not.toContain('question_count');
    expect(every).not.toContain('paper_count');
    expect(sql).not.toMatch(/max_points/i);
  });

  // A profile describes the present, so the regime is `regimeOf(country)` and
  // not a column. The consent record is the deliberate exception: what somebody
  // agreed under on a given day is history and cannot be recomputed.
  it('stores the country on the profile and derives the regime from it', () => {
    expect(columnsOf(schema.users)).toContain('country');
    expect(columnsOf(schema.users)).not.toContain('regime');
    expect(columnsOf(schema.consents)).toContain('regime');
    expect(columnsOf(schema.consents)).toContain('version');
  });
});

describe('the columns section 5 names', () => {
  it('keys a question by points rather than by a letter', () => {
    expect([...columnsOf(schema.answerKeys)].sort()).toEqual([
      'exam_id',
      'extras',
      'form_code',
      'id',
      'key',
      'org_id',
      'points',
      'tags',
    ]);
    expect(sql).toMatch(/"points" real\[\] NOT NULL/);
  });

  it('gives every scan the columns the plan lists', () => {
    for (const column of [
      'id',
      'org_id',
      'exam_id',
      'student_ext_id',
      'answers',
      'marks',
      'score',
      'total',
      'device_id',
      'client_ts',
      'created_at',
    ]) {
      expect(columnsOf(schema.scans)).toContain(column);
    }
  });

  it('makes the email case insensitive so one mailbox cannot become two accounts', () => {
    expect(sql).toMatch(/"email" "citext" NOT NULL/);
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS citext/i);
  });

  it('carries the two scan indexes the plan asks for, both leading with org_id', () => {
    expect(sql).toMatch(
      /CREATE INDEX "idx_scans_org_exam" ON "scans" USING btree \("org_id","exam_id"\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX "idx_scans_org_created" ON "scans" USING btree \("org_id","created_at" DESC/,
    );
  });

  it('indexes the tags for the report rather than giving them a table', () => {
    expect(sql).toMatch(/CREATE INDEX "answer_keys_tags" ON "answer_keys" USING gin \("tags"\)/);
  });
});

describe('the isolation column', () => {
  it('is on every table, and is the primary key on the organisation itself', () => {
    for (const [name, table] of Object.entries(named)) {
      const columns = columnsOf(table);
      const expected = name === 'orgs' ? 'id' : name === 'login_attempts' ? 'email_hash' : 'org_id';
      expect([name, columns.includes(expected)]).toEqual([name, true]);
    }
  });
});

describe('the migrations', () => {
  it('runs the extension first, then the tables, then the privileges', () => {
    expect(migrations.map((file) => file.tag)).toEqual([
      '0000_bootstrap',
      '0001_tables',
      '0002_grants',
      '0003_credentials',
      '0004_scan_form',
      '0005_email_confirmation',
    ]);
  });

  // PGlite is PostgreSQL 18 and Supabase runs 17. `uuidv7()` exists only in 18,
  // so a default that used it would pass every test here and fail on the first
  // real deployment. Ids are generated in the application, and this is what
  // keeps that true.
  it('uses no PostgreSQL 18 function the production database does not have', () => {
    expect(sql).not.toMatch(/uuidv7\s*\(/i);
  });
});
