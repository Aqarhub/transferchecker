-- Deny by default, spelled out.
--
-- Row level security decides WHICH ROWS a role may touch. Table privileges
-- decide whether it may touch the table at all, and the two are independent: a
-- policy cannot take back a privilege that was granted. Managed PostgreSQL hands
-- new tables in `public` to the client roles by default, so a table added here
-- arrives already reachable, and this file is where that is taken back and given
-- out again deliberately.
--
-- `anon` gets nothing anywhere. Every row in this database belongs to some
-- organisation, and a caller with no token belongs to none, so there is no query
-- an anonymous client could ask that should return a row.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;--> statement-breakpoint

-- Read only. An organisation is created during signup, by the server, and a
-- client has no reason to rename or delete the thing that scopes it.
GRANT SELECT ON TABLE "orgs" TO authenticated;--> statement-breakpoint

-- A teacher edits their own profile: the interface language, and the country,
-- which is a legal event rather than a preference and is logged as one.
GRANT SELECT, UPDATE ON TABLE "users" TO authenticated;--> statement-breakpoint

-- INSERT AND SELECT ONLY, AND THIS IS THE POINT OF THE TABLE. A consent log that
-- the consenting party can rewrite is not evidence of anything. Agreeing to a
-- new policy version writes a new row; nothing edits or removes an old one.
GRANT SELECT, INSERT ON TABLE "consents" TO authenticated;--> statement-breakpoint

-- The teacher's own working data.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "templates" TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "exams" TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "answer_keys" TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "students" TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "scans" TO authenticated;--> statement-breakpoint

-- The paper counter is written by the device and never deleted by it.
GRANT SELECT, INSERT, UPDATE ON TABLE "usage" TO authenticated;--> statement-breakpoint

-- Sessions. A person may list the devices they are signed in on and end one,
-- which is why UPDATE is here and DELETE is not: ending a session sets
-- `revoked_at`, and a family that can be deleted is a theft that can be erased.
GRANT SELECT, UPDATE ON TABLE "token_families" TO authenticated;--> statement-breakpoint

-- AND `refresh_tokens` GETS NOTHING, WHICH IS THE ONLY LINE OF THIS FILE THAT IS
-- AN ABSENCE. The table has row level security on and no policy, so every client
-- is already denied every row; withholding the privilege as well means a policy
-- added by accident later still grants nobody anything. Refresh tokens are
-- presented to the auth endpoint, which runs as the owner of this schema. No
-- signed in client has any business reading the table, so it is reachable by
-- exactly nobody who holds a token.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
