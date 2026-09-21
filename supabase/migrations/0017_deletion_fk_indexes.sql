-- Foreign-key lookup indexes for account deletion / bank disconnect (see the schema.ts comment above the
-- index definitions). Measured on staging: without them, deleting a 25,000-transaction user spent ~50 s in each
-- of the two self-referencing FK triggers and timed out both deletion paths. Additive, no data change.
--
-- Locking: a plain CREATE INDEX blocks writes to "transactions" while it builds, and drizzle runs a migration
-- inside a transaction, so CONCURRENTLY is not available here. The build is milliseconds at today's table size;
-- if this is ever applied to a much larger table, do it in a quiet window.
--
-- Rollback (manual, reversible):
--   DROP INDEX "transactions_transfer_pair_idx";
--   DROP INDEX "transactions_duplicate_of_idx";
--   DROP INDEX "transactions_recurring_stream_idx";
--   DROP INDEX "transactions_plaid_account_idx";
CREATE INDEX "transactions_transfer_pair_idx" ON "transactions" USING btree ("transfer_pair_id") WHERE "transactions"."transfer_pair_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_duplicate_of_idx" ON "transactions" USING btree ("duplicate_of_id") WHERE "transactions"."duplicate_of_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_recurring_stream_idx" ON "transactions" USING btree ("recurring_stream_id") WHERE "transactions"."recurring_stream_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_plaid_account_idx" ON "transactions" USING btree ("plaid_account_id") WHERE "transactions"."plaid_account_id" is not null;