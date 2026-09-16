CREATE TYPE "public"."account_source" AS ENUM('manual', 'plaid');--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "source" "account_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint

-- One-time backfill: every existing account created through Plaid (whether
-- still connected or since disconnected) gets marked 'plaid'. A currently
-- disconnected account is identified by having landed at least one
-- bank-sourced transaction in the past, since disconnecting a bank deletes
-- its plaid_accounts row (cascade) without touching the accounts row itself
-- (transaction history must survive a disconnect). Every account created
-- from here on sets `source` explicitly at insert time (see mapAccounts /
-- createAccount), so this scan never needs to run again.
UPDATE "accounts" a
SET "source" = 'plaid'
WHERE EXISTS (SELECT 1 FROM "plaid_accounts" pa WHERE pa.account_id = a.id)
   OR EXISTS (SELECT 1 FROM "transactions" t WHERE t.account_id = a.id AND t.source = 'bank');