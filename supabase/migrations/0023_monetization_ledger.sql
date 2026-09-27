CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"payout_method_details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_status_valid" CHECK ("partners"."status" in ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"external_transaction_id" text NOT NULL,
	"platform" text NOT NULL,
	"type" text NOT NULL,
	"customer_paid_amount" integer NOT NULL,
	"currency" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_platform_valid" CHECK ("payments"."platform" in ('apple','google')),
	CONSTRAINT "payments_type_valid" CHECK ("payments"."type" in ('initial','renewal','trial_conversion')),
	CONSTRAINT "payments_customer_paid_amount_nonnegative" CHECK ("payments"."customer_paid_amount" >= 0),
	CONSTRAINT "payments_period_valid" CHECK ("payments"."period_end" > "payments"."period_start")
);
--> statement-breakpoint
CREATE TABLE "payout_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"revenue_allocation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"status" text DEFAULT 'payable' NOT NULL,
	"amount" integer NOT NULL,
	"period_covered_start" date,
	"period_covered_end" date,
	"paid_at" timestamp with time zone,
	"paid_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_amount_nonnegative" CHECK ("payouts"."amount" >= 0),
	CONSTRAINT "payouts_status_valid" CHECK ("payouts"."status" in ('payable','paid','clawed_back'))
);
--> statement-breakpoint
CREATE TABLE "platform_commission_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"rate_basis_points" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_commission_rates_platform_valid" CHECK ("platform_commission_rates"."platform" in ('apple','google')),
	CONSTRAINT "platform_commission_rates_rate_bounds" CHECK ("platform_commission_rates"."rate_basis_points" >= 0 and "platform_commission_rates"."rate_basis_points" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"voucher_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"redeemed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_allocation_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revenue_allocation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount_delta" integer NOT NULL,
	"reason" text,
	"external_reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_allocation_adjustments_type_valid" CHECK ("revenue_allocation_adjustments"."type" in ('refund','chargeback','reconciliation')),
	CONSTRAINT "revenue_allocation_adjustments_amount_delta_nonzero" CHECK ("revenue_allocation_adjustments"."amount_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "revenue_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"platform_commission_rate_id" uuid NOT NULL,
	"redemption_id" uuid NOT NULL,
	"customer_paid_amount" integer NOT NULL,
	"commission_eligible_amount" integer NOT NULL,
	"commissionable_proceeds" integer NOT NULL,
	"influencer_percentage" integer NOT NULL,
	"influencer_amount" integer NOT NULL,
	"budgts_percentage" integer NOT NULL,
	"budgts_amount" integer NOT NULL,
	"commission_window_determination" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_allocations_customer_paid_amount_nonnegative" CHECK ("revenue_allocations"."customer_paid_amount" >= 0),
	CONSTRAINT "revenue_allocations_commission_eligible_bounds" CHECK ("revenue_allocations"."commission_eligible_amount" >= 0 and "revenue_allocations"."commission_eligible_amount" <= "revenue_allocations"."customer_paid_amount"),
	CONSTRAINT "revenue_allocations_commissionable_proceeds_bounds" CHECK ("revenue_allocations"."commissionable_proceeds" >= 0 and "revenue_allocations"."commissionable_proceeds" <= "revenue_allocations"."commission_eligible_amount"),
	CONSTRAINT "revenue_allocations_influencer_percentage_bounds" CHECK ("revenue_allocations"."influencer_percentage" >= 0 and "revenue_allocations"."influencer_percentage" <= 10000),
	CONSTRAINT "revenue_allocations_budgts_percentage_bounds" CHECK ("revenue_allocations"."budgts_percentage" >= 0 and "revenue_allocations"."budgts_percentage" <= 10000),
	CONSTRAINT "revenue_allocations_percentages_sum_whole" CHECK ("revenue_allocations"."influencer_percentage" + "revenue_allocations"."budgts_percentage" = 10000),
	CONSTRAINT "revenue_allocations_influencer_amount_nonnegative" CHECK ("revenue_allocations"."influencer_amount" >= 0),
	CONSTRAINT "revenue_allocations_budgts_amount_nonnegative" CHECK ("revenue_allocations"."budgts_amount" >= 0),
	CONSTRAINT "revenue_allocations_amounts_sum_to_proceeds" CHECK ("revenue_allocations"."influencer_amount" + "revenue_allocations"."budgts_amount" = "revenue_allocations"."commissionable_proceeds"),
	CONSTRAINT "revenue_allocations_window_determination_valid" CHECK ("revenue_allocations"."commission_window_determination" in ('within_window','outside_window','prorated_boundary'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"platform_subscription_id" text NOT NULL,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"first_paid_at" timestamp with time zone,
	"attributed_partner_id" uuid,
	"attributed_voucher_id" uuid,
	"attributed_redemption_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_platform_valid" CHECK ("subscriptions"."platform" in ('apple','google')),
	CONSTRAINT "subscriptions_plan_valid" CHECK ("subscriptions"."plan" in ('monthly','annual')),
	CONSTRAINT "subscriptions_status_valid" CHECK ("subscriptions"."status" in ('trialing','active','paused','grace','past_due','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_status_valid" CHECK ("vouchers"."status" in ('active','inactive'))
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_allocations" ADD CONSTRAINT "payout_allocations_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_allocations" ADD CONSTRAINT "payout_allocations_revenue_allocation_id_revenue_allocations_id_fk" FOREIGN KEY ("revenue_allocation_id") REFERENCES "public"."revenue_allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_allocation_adjustments" ADD CONSTRAINT "revenue_allocation_adjustments_revenue_allocation_id_revenue_allocations_id_fk" FOREIGN KEY ("revenue_allocation_id") REFERENCES "public"."revenue_allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_platform_commission_rate_id_platform_commission_rates_id_fk" FOREIGN KEY ("platform_commission_rate_id") REFERENCES "public"."platform_commission_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_redemption_id_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."redemptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_attributed_partner_id_partners_id_fk" FOREIGN KEY ("attributed_partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_attributed_voucher_id_vouchers_id_fk" FOREIGN KEY ("attributed_voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_attributed_redemption_id_redemptions_id_fk" FOREIGN KEY ("attributed_redemption_id") REFERENCES "public"."redemptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_subscription_occurred_idx" ON "payments" USING btree ("subscription_id","occurred_at");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_external_transaction_id_uq" ON "payments" USING btree ("external_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_allocations_revenue_allocation_id_uq" ON "payout_allocations" USING btree ("revenue_allocation_id");--> statement-breakpoint
CREATE INDEX "payout_allocations_payout_idx" ON "payout_allocations" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "payouts_partner_idx" ON "payouts" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_commission_rates_platform_effective_idx" ON "platform_commission_rates" USING btree ("platform","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_commission_rates_single_open_per_platform_uq" ON "platform_commission_rates" USING btree ("platform") WHERE "platform_commission_rates"."effective_to" is null;--> statement-breakpoint
CREATE INDEX "redemptions_user_idx" ON "redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "redemptions_voucher_idx" ON "redemptions" USING btree ("voucher_id");--> statement-breakpoint
CREATE INDEX "redemptions_partner_idx" ON "redemptions" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "revenue_allocation_adjustments_allocation_idx" ON "revenue_allocation_adjustments" USING btree ("revenue_allocation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_allocation_adjustments_external_ref_uq" ON "revenue_allocation_adjustments" USING btree ("external_reference_id") WHERE "revenue_allocation_adjustments"."external_reference_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_allocations_payment_id_uq" ON "revenue_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "revenue_allocations_partner_idx" ON "revenue_allocations" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "revenue_allocations_user_idx" ON "revenue_allocations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_platform_subscription_id_uq" ON "subscriptions" USING btree ("platform_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_attributed_partner_idx" ON "subscriptions" USING btree ("attributed_partner_id") WHERE "subscriptions"."attributed_partner_id" is not null;--> statement-breakpoint
CREATE INDEX "vouchers_partner_idx" ON "vouchers" USING btree ("partner_id");
-- ===========================================================================
-- Hand-authored (not generated by drizzle-kit): auth.users FKs, a
-- case-insensitive uniqueness index Drizzle can't express, RLS + policies,
-- and the immutability/append-only enforcement triggers.
-- Monetization Ledger (parallel track) — design doc
-- docs/specs/2026-09-18-monetization-ledger-design.md.
-- See docs/conventions.md -> "Building a feature - the layer order", step 1.
--
-- user_id FKs use ON DELETE RESTRICT, not the CASCADE used by every other
-- per-user table in this schema — deliberate deviation, see the schema.ts
-- comment above these tables and the spec's "Contradictions found" section.
--
-- Financial-fact tables (redemptions, payments, revenue_allocations,
-- revenue_allocation_adjustments) all get the SAME hard trigger, blocking
-- UPDATE and DELETE outright — revenue_allocations included, no exceptions:
-- a post-review correction (see conversation record, revenue_allocations.
-- status removal) found that a mutable status column on this table either
-- duplicated state payouts/payout_allocations already own, or — for
-- "clawed_back" specifically — encoded a financial reversal with no
-- attached amount/reason/timestamp, which is exactly what
-- revenue_allocation_adjustments exists to prevent. Settlement state is read
-- by joining payout_allocations -> payouts.status, never stored here.
--
-- subscriptions gets a narrower trigger: only first_paid_at/attributed_* are
-- write-once, everything else (status, etc.) stays freely updatable.
--
-- platform_commission_rates is append-only per platform: rate_basis_points/
-- platform/effective_from/created_at are frozen, effective_to may close
-- exactly once from null, and DELETE is blocked outright. "At most one open
-- row per platform" is DB-enforced by the partial unique index above
-- (platform_commission_rates_single_open_per_platform_uq), not by this
-- trigger — the trigger only stops an already-open row from being reopened
-- or a closed one from being edited further.
--
-- No new CHECK constraints beyond what drizzle-kit already generated above.
-- No realtime publication changes (no UI reads these tables yet — schema-only
-- phase; see docs/specs/2026-09-18-monetization-ledger-design.md).
--
-- Rollback (manual, reversible):
--   DROP POLICY "own read redemptions" ON "redemptions";
--   DROP POLICY "own read subscriptions" ON "subscriptions";
--   DROP POLICY "own read payments" ON "payments";
--   DROP POLICY "own read revenue_allocations" ON "revenue_allocations";
--   DROP POLICY "deny client access partners" ON "partners";
--   DROP POLICY "deny client access vouchers" ON "vouchers";
--   DROP POLICY "deny client access platform_commission_rates" ON "platform_commission_rates";
--   DROP POLICY "deny client access revenue_allocation_adjustments" ON "revenue_allocation_adjustments";
--   DROP POLICY "deny client access payouts" ON "payouts";
--   DROP POLICY "deny client access payout_allocations" ON "payout_allocations";
--   DROP TRIGGER "redemptions_immutable" ON "redemptions";
--   DROP TRIGGER "payments_immutable" ON "payments";
--   DROP TRIGGER "revenue_allocations_immutable" ON "revenue_allocations";
--   DROP TRIGGER "revenue_allocation_adjustments_immutable" ON "revenue_allocation_adjustments";
--   DROP TRIGGER "subscriptions_guard_attribution" ON "subscriptions";
--   DROP TRIGGER "platform_commission_rates_guard_mutation" ON "platform_commission_rates";
--   DROP FUNCTION "public"."monetization_ledger_immutable_fact"();
--   DROP FUNCTION "public"."subscriptions_guard_attribution_mutation"();
--   DROP FUNCTION "public"."platform_commission_rates_guard_mutation"();
--   DROP INDEX "vouchers_code_lower_uq";
--   ALTER TABLE "redemptions" DROP CONSTRAINT "redemptions_user_id_auth_users_fk";
--   ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_id_auth_users_fk";
--   ALTER TABLE "payments" DROP CONSTRAINT "payments_user_id_auth_users_fk";
--   ALTER TABLE "revenue_allocations" DROP CONSTRAINT "revenue_allocations_user_id_auth_users_fk";
--   DROP TABLE "payout_allocations";
--   DROP TABLE "payouts";
--   DROP TABLE "revenue_allocation_adjustments";
--   DROP TABLE "revenue_allocations";
--   DROP TABLE "payments";
--   DROP TABLE "subscriptions";
--   DROP TABLE "redemptions";
--   DROP TABLE "vouchers";
--   DROP TABLE "platform_commission_rates";
--   DROP TABLE "partners";
-- ===========================================================================

-- --- auth.users FKs (user_id ownership columns) -----------------------------
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE restrict;--> statement-breakpoint

-- --- case-insensitive voucher code uniqueness (design §3.2) -----------------
CREATE UNIQUE INDEX "vouchers_code_lower_uq" ON "vouchers" USING btree (lower("code"));--> statement-breakpoint

-- --- Row Level Security ------------------------------------------------------
ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vouchers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "redemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "revenue_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "revenue_allocation_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payout_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_commission_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Platform/admin-owned tables (design §3.8): no authenticated client access
-- at all, matching the plaid_webhook_events precedent. No admin write path
-- exists yet (spec §6 item 5) — these tables have no application writer
-- until that's designed; service_role (which bypasses RLS) is the only way
-- in for now.
CREATE POLICY "deny client access partners" ON "partners" FOR ALL TO authenticated USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny client access vouchers" ON "vouchers" FOR ALL TO authenticated USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny client access platform_commission_rates" ON "platform_commission_rates" FOR ALL TO authenticated USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny client access revenue_allocation_adjustments" ON "revenue_allocation_adjustments" FOR ALL TO authenticated USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny client access payouts" ON "payouts" FOR ALL TO authenticated USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "deny client access payout_allocations" ON "payout_allocations" FOR ALL TO authenticated USING (false) WITH CHECK (false);--> statement-breakpoint

-- User-scoped tables (design §3.8): read-only own-row access, no
-- authenticated INSERT/UPDATE/DELETE policy at all — every write goes
-- through a backend/service-role code path, never a client insert. This is a
-- deliberate deviation from every other table in this app, where the user's
-- own supabase client both reads and writes with RLS as the guard.
CREATE POLICY "own read redemptions" ON "redemptions" FOR SELECT TO authenticated USING ((SELECT auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own read subscriptions" ON "subscriptions" FOR SELECT TO authenticated USING ((SELECT auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own read payments" ON "payments" FOR SELECT TO authenticated USING ((SELECT auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own read revenue_allocations" ON "revenue_allocations" FOR SELECT TO authenticated USING ((SELECT auth.uid()) = "user_id");--> statement-breakpoint

-- --- Immutability / append-only enforcement ---------------------------------

-- Generic guard for tables where the entire row is frozen forever once
-- written: redemptions (design §3.3), payments (§3.5), revenue_allocations
-- (§3.6 — see note above re: the removed status column),
-- revenue_allocation_adjustments (§4.6). A correction is always a new row,
-- never an edit to history.
CREATE FUNCTION "public"."monetization_ledger_immutable_fact"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rows in % are an immutable financial fact and cannot be updated or deleted (id=%)',
    TG_TABLE_NAME, OLD.id;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "redemptions_immutable"
  BEFORE UPDATE OR DELETE ON "redemptions"
  FOR EACH ROW EXECUTE FUNCTION "public"."monetization_ledger_immutable_fact"();--> statement-breakpoint

CREATE TRIGGER "payments_immutable"
  BEFORE UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "public"."monetization_ledger_immutable_fact"();--> statement-breakpoint

CREATE TRIGGER "revenue_allocations_immutable"
  BEFORE UPDATE OR DELETE ON "revenue_allocations"
  FOR EACH ROW EXECUTE FUNCTION "public"."monetization_ledger_immutable_fact"();--> statement-breakpoint

CREATE TRIGGER "revenue_allocation_adjustments_immutable"
  BEFORE UPDATE OR DELETE ON "revenue_allocation_adjustments"
  FOR EACH ROW EXECUTE FUNCTION "public"."monetization_ledger_immutable_fact"();--> statement-breakpoint

-- subscriptions (design §1.4, §3.4): first_paid_at and the three attributed_*
-- columns are write-once — once non-null, they can never change again, on
-- any later event including resubscription. Every other column (status,
-- updated_at, ...) stays freely updatable.
CREATE FUNCTION "public"."subscriptions_guard_attribution_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."first_paid_at" IS NOT NULL AND NEW."first_paid_at" IS DISTINCT FROM OLD."first_paid_at" THEN
    RAISE EXCEPTION 'subscriptions.first_paid_at is immutable once set (id=%)', OLD.id;
  END IF;
  IF OLD."attributed_partner_id" IS NOT NULL AND NEW."attributed_partner_id" IS DISTINCT FROM OLD."attributed_partner_id" THEN
    RAISE EXCEPTION 'subscriptions.attributed_partner_id is immutable once set (id=%)', OLD.id;
  END IF;
  IF OLD."attributed_voucher_id" IS NOT NULL AND NEW."attributed_voucher_id" IS DISTINCT FROM OLD."attributed_voucher_id" THEN
    RAISE EXCEPTION 'subscriptions.attributed_voucher_id is immutable once set (id=%)', OLD.id;
  END IF;
  IF OLD."attributed_redemption_id" IS NOT NULL AND NEW."attributed_redemption_id" IS DISTINCT FROM OLD."attributed_redemption_id" THEN
    RAISE EXCEPTION 'subscriptions.attributed_redemption_id is immutable once set (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "subscriptions_guard_attribution"
  BEFORE UPDATE ON "subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "public"."subscriptions_guard_attribution_mutation"();--> statement-breakpoint

-- platform_commission_rates (design §2.4): append-only per platform.
-- rate_basis_points/platform/effective_from/created_at are frozen;
-- effective_to may close exactly once, from null to a timestamp, and never
-- again. Row can never be deleted. "At most one open row per platform" is
-- enforced separately by the partial unique index generated above.
CREATE FUNCTION "public"."platform_commission_rates_guard_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'platform_commission_rates rows are permanent and cannot be deleted (id=%)', OLD.id;
  END IF;
  IF NEW."platform" IS DISTINCT FROM OLD."platform"
     OR NEW."rate_basis_points" IS DISTINCT FROM OLD."rate_basis_points"
     OR NEW."effective_from" IS DISTINCT FROM OLD."effective_from"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'platform_commission_rates platform/rate/effective_from are immutable (id=%)', OLD.id;
  END IF;
  IF OLD."effective_to" IS NOT NULL THEN
    RAISE EXCEPTION 'platform_commission_rates.effective_to can only be closed once, from null (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "platform_commission_rates_guard_mutation"
  BEFORE UPDATE OR DELETE ON "platform_commission_rates"
  FOR EACH ROW EXECUTE FUNCTION "public"."platform_commission_rates_guard_mutation"();