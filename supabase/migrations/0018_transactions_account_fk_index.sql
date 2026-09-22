-- Companion to 0017: the lookup Postgres runs on transactions.account_id when an account row is deleted (the
-- RESTRICT check) had no usable index, because the existing account+fingerprint index is partial. Measured on
-- staging at 250k rows: 25-100 ms per account warm, 1.6-10 s cold, linear in table size. Also serves the Plaid
-- purge, which deletes transactions by account. Additive, no data change. Same locking note as 0017.
--
-- Rollback (manual, reversible):
--   DROP INDEX "transactions_account_idx";
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("account_id");