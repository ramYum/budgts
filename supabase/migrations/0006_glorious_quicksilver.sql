ALTER TABLE "plaid_accounts" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plaid_accounts" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "plaid_accounts" ADD COLUMN "review_flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "content_fingerprint" text;--> statement-breakpoint
CREATE INDEX "transactions_account_fingerprint_idx" ON "transactions" USING btree ("account_id","content_fingerprint") WHERE "transactions"."content_fingerprint" is not null;