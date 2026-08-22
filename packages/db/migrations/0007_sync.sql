ALTER TABLE "answer_keys" ADD COLUMN "client_ts" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "answer_keys" ADD COLUMN "synced_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "client_ts" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "synced_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "client_ts" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "synced_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "client_ts" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "synced_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_answer_keys_org_synced" ON "answer_keys" USING btree ("org_id","synced_at");--> statement-breakpoint
CREATE INDEX "idx_exams_org_synced" ON "exams" USING btree ("org_id","synced_at");--> statement-breakpoint
CREATE INDEX "idx_students_org_synced" ON "students" USING btree ("org_id","synced_at");--> statement-breakpoint
CREATE INDEX "idx_templates_org_synced" ON "templates" USING btree ("org_id","synced_at");