CREATE TABLE "email_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_verifications_user" ON "email_verifications" USING btree ("user_id","created_at");--> statement-breakpoint

-- AND THE TABLE IS GRANTED NOTHING, WHICH IS THE ENTRY.
-- `0002_grants.sql` revoked everything from both client roles and handed back
-- exactly what a teacher needs. A table created after that migration ran arrives
-- with whatever the database's default privileges say, so the revoke is restated
-- here. This is the fourth table nobody reaches: an unclicked confirmation link
-- is redeemed by an endpoint on the server, and no signed in client has a use
-- for one.
REVOKE ALL ON TABLE "email_verifications" FROM anon, authenticated;