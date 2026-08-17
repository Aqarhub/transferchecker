-- The role the authentication endpoints run as, and the line it may not cross.
--
-- WHY A ROLE HAD TO BE INVENTED AT ALL. Every policy in this schema answers the
-- question "does the caller's token name this organisation". Authentication is
-- the work that happens BEFORE there is a token, so no policy can admit it, and
-- [measured] the application role was denied on every operation a sign in makes:
-- reading a password hash, writing the failure counter, writing a session,
-- writing a confirmation, and creating the organisation a signup needs. The
-- account lookup was worse than denied, returning zero rows and raising nothing.
--
-- THE ANSWER THAT WAS REFUSED, AND WHY. A role carrying BYPASSRLS would fix all
-- of it in one line, and `0000_bootstrap.sql` refused to create one for a reason
-- that has not changed: that attribute skips every policy in every database,
-- always, and FORCE ROW LEVEL SECURITY does not touch it. A second such role
-- would widen the blast radius of one leaked password to the whole database.
--
-- SO THE ROLE IS NARROW BY CONSTRUCTION, IN TWO LAYERS THAT MUST AGREE. The
-- grants say which TABLES it may touch, and the policies say which COMMANDS and
-- which rows. `tc_auth` may insert an organisation and may not read one; it may
-- read a profile and may not edit one; it may revoke a session and may not
-- delete one, which is the same rule that keeps a theft from being erased.
--
-- AND THE LINE, STATED PLAINLY. `tc_auth` can read every teacher's address and
-- every password hash, because a login endpoint that cannot look up an account
-- by address is not a login endpoint. It can reach NOT ONE ROW of teacher data:
-- no template, no exam, no answer key, no pupil, no scan, no usage counter. That
-- is the difference between this and the attribute we refused, it is the reason
-- this is safe to add, and `auditIsolation` checks it on the live database
-- rather than trusting this comment.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tc_auth') THEN
    CREATE ROLE tc_auth NOLOGIN NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint

-- Deny by default, then hand back exactly what an endpoint needs, which is the
-- same shape `0002_grants.sql` uses for the client roles.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM tc_auth;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO tc_auth;--> statement-breakpoint

-- SIGNUP. Three rows in one transaction, across an organisation that does not
-- exist yet. INSERT and nothing else: an endpoint that creates accounts has no
-- business reading, editing or removing the ones already there.
GRANT INSERT ON TABLE "orgs" TO tc_auth;--> statement-breakpoint
CREATE POLICY "orgs_auth_signup" ON "orgs" AS PERMISSIVE FOR INSERT TO tc_auth WITH CHECK (true);--> statement-breakpoint

GRANT INSERT ON TABLE "consents" TO tc_auth;--> statement-breakpoint
CREATE POLICY "consents_auth_signup" ON "consents" AS PERMISSIVE FOR INSERT TO tc_auth WITH CHECK (true);--> statement-breakpoint

-- THE PROFILE. Read, because a sign in starts by finding an account from an
-- address and cannot know the organisation before it does. Insert, for signup.
-- No update and no delete: changing a profile is the teacher's own action, taken
-- through a token, under the ordinary isolation policy.
GRANT SELECT, INSERT ON TABLE "users" TO tc_auth;--> statement-breakpoint
CREATE POLICY "users_auth_read" ON "users" AS PERMISSIVE FOR SELECT TO tc_auth USING (true);--> statement-breakpoint
CREATE POLICY "users_auth_signup" ON "users" AS PERMISSIVE FOR INSERT TO tc_auth WITH CHECK (true);--> statement-breakpoint

-- THE PASSWORD. Read to verify, insert to set, update to replace or to record a
-- confirmed mailbox. Never deleted: an account without a credential row is an
-- account nobody can sign into and nobody can repair.
GRANT SELECT, INSERT, UPDATE ON TABLE "credentials" TO tc_auth;--> statement-breakpoint
CREATE POLICY "credentials_auth" ON "credentials" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);--> statement-breakpoint

-- THE THROTTLE. The one table here that is deleted from, twice: on a successful
-- sign in, which is what resets the counter, and on a schedule for rows nobody
-- is waiting on.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "login_attempts" TO tc_auth;--> statement-breakpoint
CREATE POLICY "login_attempts_auth" ON "login_attempts" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);--> statement-breakpoint

-- THE SESSION. No DELETE on either table, deliberately. A family is revoked and
-- never removed, because the row recording why is the only evidence a theft ever
-- happened, and a token is marked used rather than dropped so that presenting it
-- again still reads as reuse.
GRANT SELECT, INSERT, UPDATE ON TABLE "token_families" TO tc_auth;--> statement-breakpoint
CREATE POLICY "token_families_auth" ON "token_families" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE "refresh_tokens" TO tc_auth;--> statement-breakpoint
CREATE POLICY "refresh_tokens_auth" ON "refresh_tokens" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);--> statement-breakpoint

-- THE CONFIRMATION LINK. Deleted on a schedule, under two conditions that the
-- application enforces, because these rows are also the resend counter.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "email_verifications" TO tc_auth;--> statement-breakpoint
CREATE POLICY "email_verifications_auth" ON "email_verifications" AS PERMISSIVE FOR ALL TO tc_auth USING (true) WITH CHECK (true);
