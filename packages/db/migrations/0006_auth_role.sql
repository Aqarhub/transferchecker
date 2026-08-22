-- The authentication service's own role, and the fence around it.
--
-- WHY IT EXISTS. The app connects as an unprivileged login role and becomes
-- `authenticated` per request, and that is right for tenant work and useless
-- for auth work: verifying a password means reading `credentials`, rotating a
-- token means writing `refresh_tokens`, and signup means inserting rows for an
-- organisation that has no token yet. Those tables have row level security on
-- and, until this file, no policy, so they were reachable by exactly nobody.
-- That was the honest state while no server existed; a server needs a named
-- door, not a bypass.
--
-- SO THE DOOR IS A ROLE WITH POLICIES, NOT AN EXEMPTION. `tc_auth` carries no
-- BYPASSRLS and owns nothing, exactly like every other role the application
-- ever runs as, and `assertUnprivileged` keeps refusing anything that does.
-- What it can reach is written below as ordinary grants and ordinary policies,
-- which means `verify` can read the fence off the live database instead of
-- trusting a note. This is GoTrue's own shape translated here: their auth
-- service reaches auth tables through ownership of a separate schema; ours
-- reaches them through explicit policies in the one schema we have.
--
-- AND THE FENCE RUNS BOTH WAYS. The auth role gets NOTHING on grading data:
-- no scans, no exams, no keys, no students. A compromise of the auth path must
-- not be able to read a single grade, just as no signed in teacher can read a
-- single password hash. A check in `audit.ts` holds each direction.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tc_auth') THEN
    CREATE ROLE tc_auth NOLOGIN NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO tc_auth;
--> statement-breakpoint

-- On the live instance the application's login role must be able to put this
-- hat on. The role does not exist where the tests boot, and that is fine: the
-- tests run the auth layer as `tc_auth` directly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tc_app') THEN
    GRANT tc_auth TO tc_app;
  END IF;
END
$$;
--> statement-breakpoint

-- The auth tables, verb by verb. No DELETE on credentials or on the session
-- tables: a password row is replaced, never removed, and a revoked family is
-- evidence, which is the session layer's own stated rule.
GRANT SELECT, INSERT, UPDATE ON TABLE "credentials" TO tc_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "login_attempts" TO tc_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "refresh_tokens" TO tc_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "token_families" TO tc_auth;
--> statement-breakpoint

-- Signup writes an organisation, a profile and two consents before any token
-- exists, and login joins users to find whose password to check. INSERT and
-- nothing else on the consent log, which stays append only for this role too.
GRANT INSERT ON TABLE "orgs" TO tc_auth;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "users" TO tc_auth;
--> statement-breakpoint
GRANT INSERT ON TABLE "consents" TO tc_auth;
--> statement-breakpoint

-- The policies. `using (true)` is correct here and would be a defect anywhere
-- else: the auth service legitimately works across every account, because
-- "which row" is the question it exists to answer. The verbs are fenced by the
-- grants above, and the tables it holds no grant on stay invisible whatever a
-- policy might have said.
CREATE POLICY "credentials_auth" ON "credentials" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "login_attempts_auth" ON "login_attempts" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "refresh_tokens_auth" ON "refresh_tokens" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "token_families_auth" ON "token_families" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "orgs_auth" ON "orgs" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "users_auth" ON "users" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "consents_auth" ON "consents" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);
