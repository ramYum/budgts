/**
 * Shared harness for the DB-integration layer. Connects to budgts-staging ONLY
 * (guards on the project ref), and seeds/tears down a throwaway auth user whose
 * `handle_new_user` trigger provides the default categories + a "Main" account.
 *
 * Everything created here is synthetic test data — never mistake it for a real
 * Plaid integration.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as schema from "@/lib/db/schema";

// Budgets-Staging-3 (replacing budgts-staging-2, moxwnuiiueyxyypzvamc, and the retired/drifted budgts-staging,
// iwypmifvmtmkwtnxkfma) — see docs/operations/database-migrations.md and staging-replacement.md.
const STAGING_REF = "uvowywszaiojboaxdmoz";
const url = process.env.DIRECT_URL;
if (!url || !url.includes(STAGING_REF)) {
  throw new Error(
    `DB-integration tests need .env.staging DIRECT_URL pointing at budgts-staging (${STAGING_REF}); got ${
      url ? "a different target" : "nothing"
    }`,
  );
}

export const client = postgres(url, { prepare: false, max: 4 });
export const db = drizzle(client, { schema });

let supabaseAdmin: SupabaseClient | null = null;
/**
 * Service-role supabase-js client (bypasses RLS) for testing code that goes
 * through PostgREST rather than Drizzle-over-direct-Postgres — e.g.
 * transaction-update.ts's optimistic conditional update, whose correctness
 * depends on real PostgREST `.eq()` filter semantics, not just SQL. RLS
 * itself is a separate, already-covered concern; this client bypassing it
 * is not a gap for what this proves.
 */
export function adminSupabase(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secret) {
    throw new Error("DB-integration tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.staging");
  }
  supabaseAdmin = createClient(supabaseUrl, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  return supabaseAdmin;
}

/** Insert a bare `auth.users` row (the trigger does the rest); return its id. */
export async function seedUser(): Promise<string> {
  const [row] = await client<{ id: string }[]>`
    insert into auth.users (id, aud, role, email)
    values (gen_random_uuid(), 'authenticated', 'authenticated',
            concat('itest+', gen_random_uuid(), '@example.test'))
    returning id`;
  return row.id;
}

/** Delete the user; every owned row cascades (auth.users FK ON DELETE cascade). */
export async function cleanupUser(id: string): Promise<void> {
  await client`delete from auth.users where id = ${id}`;
}

export async function categoryIdByName(userId: string, name: string): Promise<string> {
  const [row] = await client<{ id: string }[]>`
    select id from public.categories where user_id = ${userId} and name = ${name} limit 1`;
  if (!row) throw new Error(`no category "${name}" for ${userId}`);
  return row.id;
}

export async function mainAccountId(userId: string): Promise<string> {
  const [row] = await client<{ id: string }[]>`
    select id from public.accounts where user_id = ${userId} order by created_at limit 1`;
  if (!row) throw new Error(`no account for ${userId}`);
  return row.id;
}

/** A second (or third, ...) account for the same user -- for paired-transfer
 * tests, which always need two distinct accounts. */
export async function createAccount(
  userId: string,
  name: string,
  type: "checking" | "credit" | "cash" | "savings" = "checking",
): Promise<string> {
  // NOTE: deliberately omits `source` -- migration 0015 (accounts.source)
  // is applied in production but not yet on budgts-staging, an unrelated
  // pre-existing gap between the two projects (out of scope for this
  // feature; not a schema change introduced here). The column has a
  // NOT NULL DEFAULT in the schema, so omitting it is safe wherever it
  // does exist too.
  const [row] = await client<{ id: string }[]>`
    insert into public.accounts (user_id, name, type)
    values (${userId}, ${name}, ${type})
    returning id`;
  return row.id;
}

/** Insert a synthetic `source='bank'` transaction; returns its id. */
export async function insertBankTxn(
  userId: string,
  accountId: string,
  over: Partial<{
    sourceRef: string;
    categoryId: string | null;
    userCategorized: boolean;
    removedAt: string | null;
    isTransfer: boolean;
    merchantEntityId: string | null;
    merchantName: string | null;
    description: string;
    primary: string | null;
    detailed: string | null;
    confidence: string | null;
    amount: number;
    duplicateOfId: string | null;
    direction: "debit" | "credit";
    status: "confirmed" | "pending_review";
    pendingReason: "currency_mismatch" | "sign_convention_unknown" | null;
    plaidAccountId: string | null;
    /** The stored Plaid payload. Sign-convention evidence reads `raw.amount`
     *  from here — it is the immutable original, unlike `direction`. */
    raw: unknown;
    eventRole: string | null;
    transferUserSet: boolean;
    transferPairId: string | null;
    pending: boolean;
    occurredAt: string;
  }> = {},
): Promise<string> {
  const v = {
    sourceRef: `itest-${crypto.randomUUID()}`,
    categoryId: null as string | null,
    userCategorized: false,
    removedAt: null as string | null,
    isTransfer: false,
    merchantEntityId: null as string | null,
    merchantName: null as string | null,
    description: "itest txn",
    primary: null as string | null,
    detailed: null as string | null,
    confidence: null as string | null,
    amount: 1234,
    duplicateOfId: null as string | null,
    direction: "debit" as "debit" | "credit",
    status: "confirmed" as "confirmed" | "pending_review",
    pendingReason: null as "currency_mismatch" | "sign_convention_unknown" | null,
    plaidAccountId: null as string | null,
    raw: null as unknown,
    eventRole: null as string | null,
    transferUserSet: false,
    transferPairId: null as string | null,
    pending: false,
    occurredAt: new Date().toISOString(),
    ...over,
  };
  const [row] = await client<{ id: string }[]>`
    insert into public.transactions
      (user_id, account_id, category_id, amount, direction, occurred_at, description,
       source, source_ref, is_transfer, user_categorized, removed_at,
       merchant_entity_id, merchant_name, plaid_category_primary, plaid_category_detailed, plaid_pfc_confidence,
       duplicate_of_id, status, pending_reason, plaid_account_id, raw, event_role, transfer_user_set,
       transfer_pair_id, pending)
    values
      (${userId}, ${accountId}, ${v.categoryId}, ${v.amount}, ${v.direction}, ${v.occurredAt}, ${v.description},
       'bank', ${v.sourceRef}, ${v.isTransfer}, ${v.userCategorized}, ${v.removedAt},
       ${v.merchantEntityId}, ${v.merchantName}, ${v.primary}, ${v.detailed}, ${v.confidence},
       ${v.duplicateOfId}, ${v.status}, ${v.pendingReason}, ${v.plaidAccountId},
       ${v.raw === null ? null : JSON.stringify(v.raw)}::jsonb, ${v.eventRole}, ${v.transferUserSet},
       ${v.transferPairId}, ${v.pending})
    returning id`;
  return row.id;
}

/** Read the fields the categorization tests assert on. */
export async function readTxn(id: string): Promise<{
  category_id: string | null;
  user_categorized: boolean;
  removed_at: string | null;
  is_transfer: boolean;
  transfer_user_set: boolean;
  description: string;
  event_role: string | null;
  transfer_pair_id: string | null;
  duplicate_of_id: string | null;
}> {
  const [row] = await client<
    {
      category_id: string | null;
      user_categorized: boolean;
      removed_at: string | null;
      is_transfer: boolean;
      transfer_user_set: boolean;
      description: string;
      event_role: string | null;
      transfer_pair_id: string | null;
      duplicate_of_id: string | null;
    }[]
  >`select category_id, user_categorized, removed_at, is_transfer, transfer_user_set, description,
      event_role, transfer_pair_id, duplicate_of_id
    from public.transactions where id = ${id}`;
  return row;
}
