CREATE TYPE "public"."plaid_sign_convention" AS ENUM('unknown', 'standard', 'inverted');--> statement-breakpoint
ALTER TABLE "plaid_accounts" ADD COLUMN "sign_convention" "plaid_sign_convention" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "pending_reason" text;