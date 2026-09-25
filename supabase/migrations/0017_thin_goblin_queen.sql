-- Per-item sync lease (src/lib/plaid/item-store.ts claimItemForSync). Additive,
-- nullable, no backfill: every existing row reads as "not claimed".
-- Reverse (only after rolling the app back to a build that does not read them):
--   ALTER TABLE "plaid_items" DROP COLUMN "sync_claimed_at";
--   ALTER TABLE "plaid_items" DROP COLUMN "sync_claim_token";
ALTER TABLE "plaid_items" ADD COLUMN "sync_claim_token" uuid;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "sync_claimed_at" timestamp with time zone;
