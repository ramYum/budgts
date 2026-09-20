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
import { isPlaidItemAlreadyRemoved, readPlaidError } from "@/lib/plaid/error-policy";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type DisconnectResult =
  | { ok: true; purged: boolean }
  | { ok: false; status: 404 | 500; error: string };

/** A log-safe description of why `/item/remove` could not run: an error code or class name, never a message or body. */
function describeRemovalFailure(e: unknown): string {
  const plaidCode = readPlaidError(e)?.error_code;
  if (plaidCode) return plaidCode;
  const transportCode = (e as { code?: unknown } | null)?.code;
  if (typeof transportCode === "string") return transportCode;
  return e instanceof Error ? e.name : "non-error value thrown";
}

export async function disconnectPlaidItem(
  supabase: SupabaseServerClient,
  args: {
    userId: string;
    itemId: string;
    purge?: boolean;
    /**
     * Fail closed on Plaid. Default `false` keeps the user-facing "disconnect bank" behaviour: a
     * revoked/expired Item must always be disconnectable locally.
     *
     * `true` is for account deletion, where a swallowed failure is not harmless: the local row
     * holds the only copy of the encrypted access token, so deleting it after a failed
     * `/item/remove` leaves a live bank connection at Plaid that can never be removed. In strict
     * mode the local row is deleted ONLY once Plaid has confirmed removal, or answered that the
     * Item is already gone (ITEM_NOT_FOUND). Anything else — rate limit, 5xx, transport failure,
     * an unusable token, a token that will not decrypt — stops here with the row intact, so the
     * caller can retry.
     */
    strict?: boolean;
  },
): Promise<DisconnectResult> {
  const { userId, itemId, purge = false, strict = false } = args;

  // RLS scopes this select to the caller.
  const { data: item } = await supabase
    .from("plaid_items")
    .select("id, access_token_enc")
    .eq("item_id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, status: 404, error: "unknown item" };

  // Default: best-effort at Plaid — a revoked/expired Item can't be removed but must
  // still disconnect locally. Strict (account deletion): see the `strict` docs above.
  try {
    const token = decryptToken(item.access_token_enc, loadPlaidConfig().tokenEncKey);
    await plaidClient().itemRemove({ access_token: token });
  } catch (e) {
    if (!strict) {
      console.warn("[plaid] item/remove", readPlaidError(e)?.error_code ?? (e as Error).message);
    } else if (isPlaidItemAlreadyRemoved(e)) {
      console.warn("[plaid] item/remove: already removed at Plaid");
    } else {
      console.error("[plaid] item/remove failed; keeping the local Item so removal can be retried:", describeRemovalFailure(e));
      return { ok: false, status: 500, error: "could not remove bank connection" };
    }
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
