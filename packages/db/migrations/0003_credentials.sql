CREATE TABLE "credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"password_hash" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_login_attempts_stale" ON "login_attempts" USING btree ("last_failure_at");--> statement-breakpoint

-- AND NEITHER NEW TABLE IS GRANTED ANYTHING, WHICH IS THE ENTRY.
-- `0002_grants.sql` revoked everything from both client roles and then handed
-- back exactly what a teacher needs. A table created after that migration ran
-- arrives with whatever the database's default privileges say, so the revoke is
-- restated here for the two that must reach nobody at all. A password hash and a
-- failure counter are verified by the server; no client has a use for either.
REVOKE ALL ON TABLE "credentials" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "login_attempts" FROM anon, authenticated;
