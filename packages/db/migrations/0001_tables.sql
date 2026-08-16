CREATE TABLE "answer_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"form_code" char(1) NOT NULL,
	"key" text NOT NULL,
	"points" real[] NOT NULL,
	"extras" jsonb NOT NULL,
	"tags" jsonb NOT NULL,
	CONSTRAINT "answer_keys_form" UNIQUE("exam_id","form_code")
);
--> statement-breakpoint
ALTER TABLE "answer_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"document" text NOT NULL,
	"regime" text NOT NULL,
	"country" char(2) NOT NULL,
	"language" char(2) NOT NULL,
	"version" date NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "consents_once" UNIQUE("user_id","document","version")
);
--> statement-breakpoint
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"template_id" uuid NOT NULL,
	"form_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orgs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_ext_id" text,
	"answers" text NOT NULL,
	"marks" text NOT NULL,
	"score" real NOT NULL,
	"total" real NOT NULL,
	"device_id" text NOT NULL,
	"client_ts" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"ext_id" text NOT NULL,
	"name" text,
	CONSTRAINT "students_ext_id" UNIQUE("org_id","ext_id")
);
--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"spec" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "token_families" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text
);
--> statement-breakpoint
ALTER TABLE "token_families" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usage" (
	"org_id" uuid NOT NULL,
	"month" date NOT NULL,
	"papers_graded" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone,
	CONSTRAINT "usage_org_id_month_pk" PRIMARY KEY("org_id","month")
);
--> statement-breakpoint
ALTER TABLE "usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"locale" text NOT NULL,
	"country" char(2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "answer_keys" ADD CONSTRAINT "answer_keys_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_keys" ADD CONSTRAINT "answer_keys_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_family_id_token_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."token_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_families" ADD CONSTRAINT "token_families_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_families" ADD CONSTRAINT "token_families_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answer_keys_tags" ON "answer_keys" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "answer_keys_org" ON "answer_keys" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_family" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "idx_scans_org_exam" ON "scans" USING btree ("org_id","exam_id");--> statement-breakpoint
CREATE INDEX "idx_scans_org_created" ON "scans" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_token_families_user" ON "token_families" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE POLICY "answer_keys_isolation" ON "answer_keys" AS PERMISSIVE FOR ALL TO "authenticated" USING ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid)) WITH CHECK ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid));--> statement-breakpoint
CREATE POLICY "consents_isolation" ON "consents" AS PERMISSIVE FOR ALL TO "authenticated" USING ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid)) WITH CHECK ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid));--> statement-breakpoint
CREATE POLICY "exams_isolation" ON "exams" AS PERMISSIVE FOR ALL TO "authenticated" USING ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid)) WITH CHECK ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid));--> statement-breakpoint
CREATE POLICY "orgs_isolation" ON "orgs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid)) WITH CHECK ("id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid));--> statement-breakpoint
CREATE POLICY "scans_isolation" ON "scans" AS PERMISSIVE FOR ALL TO "authenticated" USING ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid)) WITH CHECK ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid));--> statement-breakpoint
CREATE POLICY "students_isolation" ON "students" AS PERMISSIVE FOR ALL TO "authenticated" USING ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid)) WITH CHECK ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid));--> statement-breakpoint
CREATE POLICY "templates_isolation" ON "templates" AS PERMISSIVE FOR ALL TO "authenticated" USING ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid)) WITH CHECK ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid));--> statement-breakpoint
CREATE POLICY "token_families_own" ON "token_families" AS PERMISSIVE FOR ALL TO "authenticated" USING ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid) and "user_id" = auth.uid()) WITH CHECK ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid) and "user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "usage_isolation" ON "usage" AS PERMISSIVE FOR ALL TO "authenticated" USING ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid)) WITH CHECK ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid));--> statement-breakpoint
CREATE POLICY "users_isolation" ON "users" AS PERMISSIVE FOR ALL TO "authenticated" USING ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid)) WITH CHECK ("org_id" = (select ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid));