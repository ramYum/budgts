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
import * as schema from "@/lib/db/schema";

const STAGING_REF = "iwypmifvmtmkwtnxkfma";
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
    ...over,
  };
  const [row] = await client<{ id: string }[]>`
    insert into public.transactions
      (user_id, account_id, category_id, amount, direction, occurred_at, description,
       source, source_ref, is_transfer, user_categorized, removed_at,
       merchant_entity_id, merchant_name, plaid_category_primary, plaid_category_detailed, plaid_pfc_confidence,
       duplicate_of_id, status, pending_reason, plaid_account_id, raw, event_role)
    values
      (${userId}, ${accountId}, ${v.categoryId}, ${v.amount}, ${v.direction}, now(), ${v.description},
       'bank', ${v.sourceRef}, ${v.isTransfer}, ${v.userCategorized}, ${v.removedAt},
       ${v.merchantEntityId}, ${v.merchantName}, ${v.primary}, ${v.detailed}, ${v.confidence},
       ${v.duplicateOfId}, ${v.status}, ${v.pendingReason}, ${v.plaidAccountId},
       ${v.raw === null ? null : JSON.stringify(v.raw)}::jsonb, ${v.eventRole})
    returning id`;
  return row.id;
}

/** Read the fields the categorization tests assert on. */
export async function readTxn(id: string): Promise<{
  category_id: string | null;
  user_categorized: boolean;
  removed_at: string | null;
  is_transfer: boolean;
}> {
  const [row] = await client<
    { category_id: string | null; user_categorized: boolean; removed_at: string | null; is_transfer: boolean }[]
  >`select category_id, user_categorized, removed_at, is_transfer from public.transactions where id = ${id}`;
  return row;
}
