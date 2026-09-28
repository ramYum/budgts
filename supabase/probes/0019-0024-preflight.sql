-- Read-only production probe for migrations 0019-0024 (docs/deploy.md -> Notes). Changes nothing.
-- Run by the owner in the production SQL editor BEFORE deploying the Stage 0 build; every row must be ok = true.
-- tests/unit/db-migration-chain.test.ts runs this same file against the migrated chain (embedded Postgres).
select 'account_deletions table' as check, to_regclass('public.account_deletions') is not null as ok
union all select 'account_accepts_writes()', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'account_accepts_writes')
union all select 'write guard policies (restrictive)', (select count(*) from pg_policies
  where schemaname = 'public' and permissive = 'RESTRICTIVE') >= 11
union all select 'transactions FK indexes', (select count(*) from pg_indexes where schemaname = 'public'
  and indexname in ('transactions_transfer_pair_idx', 'transactions_duplicate_of_idx', 'transactions_recurring_stream_idx',
                    'transactions_plaid_account_idx', 'transactions_account_idx')) = 5
union all select 'ledger tables (10)', (select count(*) from pg_tables where schemaname = 'public'
  and tablename in ('partners', 'vouchers', 'redemptions', 'subscriptions', 'payments', 'revenue_allocations',
                    'revenue_allocation_adjustments', 'payouts', 'payout_allocations', 'platform_commission_rates')) = 10
union all select 'entitlements table', to_regclass('public.entitlements') is not null
union all select 'entitlements columns', (select count(*) from information_schema.columns
  where table_schema = 'public' and table_name = 'entitlements' and column_name in
    ('user_id', 'state', 'provider', 'store', 'product_id', 'provider_customer_id', 'will_renew', 'trial_started_at',
     'trial_ends_at', 'access_until', 'last_provider_event_at', 'last_reconciled_at', 'renewal_price_amount',
     'renewal_price_currency', 'created_at', 'updated_at')) = 16
union all select 'billing_events table', to_regclass('public.billing_events') is not null
union all select 'migration ledger at 25 rows', (select count(*) from drizzle.__drizzle_migrations) = 25;
