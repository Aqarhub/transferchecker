ALTER TABLE "scans" ADD COLUMN "form" text;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_form_length" CHECK (char_length("scans"."form") <= 4);