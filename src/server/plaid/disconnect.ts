/**
 * Disconnect a Plaid Item — the one shared implementation behind both
 * `DELETE /api/plaid/item` and the `disconnectBank` server action.
 *
 * **Financial-integrity rule (design §24).** Disconnect tears down the
 * *connection*, never the *ledger*:
 *  - it writes to `plaid_items` / `plaid_accounts` only, plus `/item/remove`;
 *  - it MUST NOT issue a DELETE or UPDATE against `transactions`;
 *  - deleting the `plaid_items` row cascades `plaid_accounts`, and
 *    `transactions.plaid_account_id → plaid_accounts.id` is `ON DELETE SET
 *    NULL`, so every imported transaction is kept, just detached.
 *
 * `purge: true` is the separate, explicit "delete my bank data" path (§24.2) —
 * the ONLY code that removes bank transactions, and only for this Item's
 * accounts.
 */
import { plaidClient } from "@/lib/plaid/client";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { decryptToken } from "@/lib/plaid/crypto";
import { readPlaidError } from "@/lib/plaid/error-policy";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type DisconnectResult =
  | { ok: true; purged: boolean }
  | { ok: false; status: 404 | 500; error: string };

export async function disconnectPlaidItem(
  supabase: SupabaseServerClient,
  args: { userId: string; itemId: string; purge?: boolean },
): Promise<DisconnectResult> {
  const { userId, itemId, purge = false } = args;

  // RLS scopes this select to the caller.
  const { data: item } = await supabase
    .from("plaid_items")
    .select("id, access_token_enc")
    .eq("item_id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, status: 404, error: "unknown item" };

  // Best-effort at Plaid — a revoked/expired Item can't be removed but must
  // still disconnect locally.
  try {
    const token = decryptToken(item.access_token_enc, loadPlaidConfig().tokenEncKey);
    await plaidClient().itemRemove({ access_token: token });
  } catch (e) {
    console.warn("[plaid] item/remove", readPlaidError(e)?.error_code ?? (e as Error).message);
  }

  if (purge) {
    const { data: accts } = await supabase
      .from("plaid_accounts")
      .select("id")
      .eq("plaid_item_id", item.id);
    const ids = (accts ?? []).map((a) => a.id);
    if (ids.length) {
      await supabase
        .from("transactions")
        .delete()
        .eq("user_id", userId)
        .eq("source", "bank")
        .in("plaid_account_id", ids);
    }
  }

  const { error: delErr } = await supabase.from("plaid_items").delete().eq("id", item.id);
  if (delErr) {
    console.error("[plaid] item delete", delErr);
    return { ok: false, status: 500, error: "could not disconnect" };
  }

  return { ok: true, purged: purge };
}
