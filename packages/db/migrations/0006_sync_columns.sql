CREATE TABLE "deletions" (
	"org_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"row_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deletions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "answer_keys" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "answer_keys" ADD COLUMN "client_ts" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "client_ts" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "client_ts" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "client_ts" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "deletions" ADD CONSTRAINT "deletions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deletions_cursor" ON "deletions" USING btree ("org_id","deleted_at","row_id");--> statement-breakpoint
CREATE INDEX "idx_answer_keys_cursor" ON "answer_keys" USING btree ("org_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_exams_cursor" ON "exams" USING btree ("org_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_scans_cursor" ON "scans" USING btree ("org_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_students_cursor" ON "students" USING btree ("org_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_templates_cursor" ON "templates" USING btree ("org_id","updated_at","id");--> statement-breakpoint
CREATE POLICY "deletions_isolation" ON "deletions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid));--> statement-breakpoint

-- WHAT A DELETED ROW LEAVES BEHIND, WRITTEN BY THE DATABASE AND NOT BY US.
--
-- Delta sync hands a client everything that changed since a cursor, and a
-- removed row changes nothing: it is absent, and absent is indistinguishable
-- from a row the client never had. So without this, an exam deleted on a phone
-- stays on the tablet forever and nothing reports a fault.
--
-- SECURITY DEFINER, so a signed in client can cause a tombstone by deleting a
-- row it was allowed to delete, and can never write one directly. The grants
-- below give it SELECT and nothing else.
--
-- AND THE SEARCH PATH IS PINNED, which is not optional on a definer function.
-- Without it, a caller who can create a schema of their own can put a table
-- named `deletions` in front of ours and have this function write there with the
-- owner's rights. It is the one mistake that turns a convenience into an escape.
CREATE OR REPLACE FUNCTION public.record_deletion() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    INSERT INTO public.deletions (org_id, entity, row_id, deleted_at)
    VALUES (OLD.org_id, TG_TABLE_NAME, OLD.id, now())
    ON CONFLICT DO NOTHING;
    RETURN OLD;
  END
  $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.record_deletion() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_deletion() TO authenticated;--> statement-breakpoint

CREATE TRIGGER templates_deleted AFTER DELETE ON "templates"
  FOR EACH ROW EXECUTE FUNCTION public.record_deletion();--> statement-breakpoint
CREATE TRIGGER exams_deleted AFTER DELETE ON "exams"
  FOR EACH ROW EXECUTE FUNCTION public.record_deletion();--> statement-breakpoint
CREATE TRIGGER answer_keys_deleted AFTER DELETE ON "answer_keys"
  FOR EACH ROW EXECUTE FUNCTION public.record_deletion();--> statement-breakpoint
CREATE TRIGGER students_deleted AFTER DELETE ON "students"
  FOR EACH ROW EXECUTE FUNCTION public.record_deletion();--> statement-breakpoint
CREATE TRIGGER scans_deleted AFTER DELETE ON "scans"
  FOR EACH ROW EXECUTE FUNCTION public.record_deletion();--> statement-breakpoint

-- A table created after `0002_grants.sql` arrives with whatever the database's
-- default privileges say, so the revoke is restated and exactly one privilege is
-- handed back. A device learns what is gone; it cannot declare anything gone.
REVOKE ALL ON TABLE "deletions" FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE "deletions" TO authenticated;
