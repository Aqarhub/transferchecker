-- Everything that has to exist before the first table does.
--
-- THIS FILE USED TO BE ONE LINE, AND THE REST OF IT LIVED IN A TEST HARNESS.
-- The plan assumed Supabase, which creates the `auth` schema, the two claim
-- functions and the three roles before any migration of ours runs. The database
-- this product is actually deployed on is a plain managed PostgreSQL, which
-- provides none of them, so what was a stand-in for somebody else's bootstrap is
-- now our bootstrap. That is strictly better for a reason worth stating: the
-- isolation tests now apply THIS FILE rather than a copy of it that could drift.
--
-- WHAT IS DELIBERATELY ABSENT: a `service_role` carrying BYPASSRLS. Not because
-- it cannot be created, which was the first reading and was wrong. [measured on
-- the live instance] the owning account holds `rolbypassrls`, so it could confer
-- the attribute onward. It is absent because that attribute skips every policy
-- in every database, always, and `FORCE ROW LEVEL SECURITY` does not touch it
-- [measured]. Adding a second role that can see everything would widen the blast
-- radius to buy nothing. The owning account already writes what signup needs,
-- and the application connects as a role that holds no such attribute at all.

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
--> statement-breakpoint

-- The three client roles. On Supabase these already exist; here they do not, and
-- the guards make this file safe to run against either.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO anon, authenticated;
--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS auth;
--> statement-breakpoint

GRANT USAGE ON SCHEMA auth TO anon, authenticated;
--> statement-breakpoint

-- The verified token, as every isolation policy reads it.
--
-- Copied from Supabase's own definition rather than approximated, so that moving
-- this schema onto Supabase later needs no change to a single policy. The claims
-- arrive in a session setting that the connection owner writes from a token it
-- has already verified. A request body cannot reach it.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE
  AS $$
    SELECT coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  $$;
--> statement-breakpoint

-- Who the caller is. Used by the session policy, which is tighter than the rest:
-- your own sessions rather than your organisation's.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
