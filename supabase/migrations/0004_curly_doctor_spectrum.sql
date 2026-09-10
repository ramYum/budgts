CREATE TYPE "public"."plaid_account_link_state" AS ENUM('mapped', 'ignored', 'unmapped');--> statement-breakpoint
CREATE TYPE "public"."plaid_item_status" AS ENUM('active', 'login_required', 'pending_expiration', 'revoked', 'error');--> statement-breakpoint
CREATE TABLE "plaid_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plaid_item_id" uuid NOT NULL,
	"plaid_account_id" text NOT NULL,
	"account_id" uuid,
	"link_state" "plaid_account_link_state" DEFAULT 'unmapped' NOT NULL,
	"name" text,
	"official_name" text,
	"mask" text,
	"type" text,
	"subtype" text,
	"iso_currency_code" text,
	"current_balance" integer,
	"available_balance" integer,
	"balance_as_of" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"access_token_enc" text NOT NULL,
	"transactions_cursor" text,
	"status" "plaid_item_status" DEFAULT 'active' NOT NULL,
	"error_code" text,
	"needs_sync" boolean DEFAULT false NOT NULL,
	"last_webhook_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"sync_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plaid_items_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "plaid_merchant_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant_entity_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"webhook_type" text,
	"webhook_code" text,
	"item_id" text,
	"payload" jsonb,
	"handled" boolean DEFAULT false NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "plaid_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "pending_plaid_transaction_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_name" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_entity_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "plaid_category_primary" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "plaid_category_detailed" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "plaid_pfc_confidence" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_categorized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "authorized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_pair_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_stream_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "raw" jsonb;--> statement-breakpoint
ALTER TABLE "plaid_accounts" ADD CONSTRAINT "plaid_accounts_plaid_item_id_plaid_items_id_fk" FOREIGN KEY ("plaid_item_id") REFERENCES "public"."plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_accounts" ADD CONSTRAINT "plaid_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_merchant_rules" ADD CONSTRAINT "plaid_merchant_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plaid_accounts_user_idx" ON "plaid_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plaid_accounts_item_idx" ON "plaid_accounts" USING btree ("plaid_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plaid_accounts_user_account_uq" ON "plaid_accounts" USING btree ("user_id","plaid_account_id");--> statement-breakpoint
CREATE INDEX "plaid_items_user_idx" ON "plaid_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plaid_items_needs_sync_idx" ON "plaid_items" USING btree ("needs_sync") WHERE "plaid_items"."needs_sync";--> statement-breakpoint
CREATE UNIQUE INDEX "plaid_merchant_rules_user_merchant_uq" ON "plaid_merchant_rules" USING btree ("user_id","merchant_entity_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_plaid_account_id_plaid_accounts_id_fk" FOREIGN KEY ("plaid_account_id") REFERENCES "public"."plaid_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_pair_id_transactions_id_fk" FOREIGN KEY ("transfer_pair_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_merchant_entity_idx" ON "transactions" USING btree ("merchant_entity_id") WHERE "transactions"."merchant_entity_id" is not null;--> statement-breakpoint
-- ===========================================================================
-- Hand-authored (not generated by drizzle-kit): auth.users FKs, RLS + policies.
-- V1 Plaid ingestion — design doc
-- docs/specs/2026-09-09-v1-plaid-transaction-ingestion-design.md (§32.5).
-- No new CHECK constraints (balances may be negative; amount>0 on transactions
-- is unchanged). No realtime publication changes (no client subscribes to
-- these tables in V1). plaid_webhook_events has no user_id — it is written
-- only by the service-role client, before the owning user is resolved from
-- item_id — so it gets RLS enabled + an explicit deny-all policy for
-- `authenticated` (service_role bypasses RLS).
-- See docs/conventions.md -> "Building a feature - the layer order", step 1.
--
-- Rollback (manual, reversible):
--   DROP POLICY "own plaid_merchant_rules" ON "plaid_merchant_rules";
--   DROP POLICY "own plaid_accounts" ON "plaid_accounts";
--   DROP POLICY "own plaid_items" ON "plaid_items";
--   DROP POLICY "deny client access plaid_webhook_events" ON "plaid_webhook_events";
--   ALTER TABLE "transactions"
--     DROP CONSTRAINT "transactions_transfer_pair_id_transactions_id_fk",
--     DROP CONSTRAINT "transactions_plaid_account_id_plaid_accounts_id_fk",
--     DROP COLUMN "plaid_account_id", DROP COLUMN "pending",
--     DROP COLUMN "pending_plaid_transaction_id", DROP COLUMN "merchant_name",
--     DROP COLUMN "merchant_entity_id", DROP COLUMN "plaid_category_primary",
--     DROP COLUMN "plaid_category_detailed", DROP COLUMN "plaid_pfc_confidence",
--     DROP COLUMN "user_categorized", DROP COLUMN "removed_at",
--     DROP COLUMN "authorized_at", DROP COLUMN "transfer_pair_id",
--     DROP COLUMN "recurring_stream_id", DROP COLUMN "raw";
--   -- (DROP COLUMN drops transactions_merchant_entity_idx with it)
--   DROP TABLE "plaid_merchant_rules";
--   DROP TABLE "plaid_webhook_events";
--   DROP TABLE "plaid_accounts";
--   DROP TABLE "plaid_items";
--   DROP TYPE "plaid_account_link_state";
--   DROP TYPE "plaid_item_status";
-- ===========================================================================
ALTER TABLE "plaid_items" ADD CONSTRAINT "plaid_items_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "plaid_accounts" ADD CONSTRAINT "plaid_accounts_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "plaid_merchant_rules" ADD CONSTRAINT "plaid_merchant_rules_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "plaid_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plaid_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plaid_merchant_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plaid_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own plaid_items" ON "plaid_items" FOR ALL TO authenticated USING ((SELECT auth.uid()) = "user_id") WITH CHECK ((SELECT auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own plaid_accounts" ON "plaid_accounts" FOR ALL TO authenticated USING ((SELECT auth.uid()) = "user_id") WITH CHECK ((SELECT auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own plaid_merchant_rules" ON "plaid_merchant_rules" FOR ALL TO authenticated USING ((SELECT auth.uid()) = "user_id") WITH CHECK ((SELECT auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "deny client access plaid_webhook_events" ON "plaid_webhook_events" FOR ALL TO authenticated USING (false) WITH CHECK (false);