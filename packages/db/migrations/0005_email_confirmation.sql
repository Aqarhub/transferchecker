ALTER TABLE "credentials" ADD COLUMN "confirmation_token_hash" text;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "confirmation_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_confirmation" ON "credentials" USING btree ("confirmation_token_hash");