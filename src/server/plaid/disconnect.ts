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

/**
 * Postgres aborts one side of a lock cycle (40P01, deadlock) or a conflicting concurrent
 * transaction (40001, serialization failure); the documented remedy is to retry the statement.
 *
 * This is not hypothetical: the background sync (pg_cron, every ~30s) locks `transactions` rows and
 * then updates its parent `plaid_items` row, while a disconnect deletes that parent row and cascades
 * to the same transactions. Reproduced on staging — the disconnect was the victim, after Plaid had
 * already removed the Item, and the user was told "could not disconnect".
 */
const RETRYABLE_DB_CODES = new Set(["40P01", "40001"]);
const MAX_DB_ATTEMPTS = 4;

/** Runs one DB statement, re-running it only when Postgres says it was a lock/serialization victim. */
async function withDbRetry<T extends { error: { code?: string } | null }>(run: () => PromiseLike<T>): Promise<T> {
  let result = await run();
  for (let attempt = 1; attempt < MAX_DB_ATTEMPTS && result.error && RETRYABLE_DB_CODES.has(result.error.code ?? ""); attempt++) {
    console.warn("[plaid] disconnect: retrying after database", result.error.code);
    await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** (attempt - 1) + Math.random() * 50));
    result = await run();
  }
  return result;
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
    // Fail closed: the user explicitly asked for these transactions to be deleted. Carrying on after a
    // failed lookup or delete would delete the connection (detaching the rows from any account we could
    // still find them by) and report success with the data still there. Keeping the local row instead
    // leaves the user a retry; removal at Plaid is idempotent, so retrying is safe.
    const { data: accts, error: acctErr } = await supabase
      .from("plaid_accounts")
      .select("id")
      .eq("plaid_item_id", item.id);
    if (acctErr) {
      console.error("[plaid] purge: could not list the Item's accounts", acctErr.code);
      return { ok: false, status: 500, error: "could not disconnect" };
    }
    const ids = (accts ?? []).map((a) => a.id);
    if (ids.length) {
      const { error: purgeErr } = await withDbRetry(() =>
        supabase
          .from("transactions")
          .delete()
          .eq("user_id", userId)
          .eq("source", "bank")
          .in("plaid_account_id", ids),
      );
      if (purgeErr) {
        console.error("[plaid] purge: could not delete the Item's transactions; keeping the local Item", purgeErr.code);
        return { ok: false, status: 500, error: "could not disconnect" };
      }
    }
  }

  const { error: delErr } = await withDbRetry(() => supabase.from("plaid_items").delete().eq("id", item.id));
  if (delErr) {
    console.error("[plaid] item delete", delErr);
    return { ok: false, status: 500, error: "could not disconnect" };
  }

  return { ok: true, purged: purge };
}
