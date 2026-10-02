/**
 * Server-only wiring for the Plaid route handlers: webhook-key fetch, the
 * user's-own-item access token (reconnect), the native pull's bank refresh, and the one-item
 * sync runner with the real singletons. The pipeline's DB handle is `db()` from
 * `@/lib/db`. `import "server-only"` keeps this out of any client bundle and out
 * of the Vitest unit layer (these paths are covered by the Plaid-integration /
 * E2E layers). Design §6, §20–22.
 */
import "server-only";
import type { JWK } from "jose";
import { db } from "@/lib/db";
import { claimItemsDueForRefresh } from "@/lib/plaid/bank-refresh";
import { plaidClient } from "@/lib/plaid/client";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { decryptToken } from "@/lib/plaid/crypto";
import { describePlaidError } from "@/lib/plaid/error-policy";
import { findUserItem } from "@/lib/plaid/item-store";
import { drainItem, plaidSyncRunnerDeps, type SyncRunnerDeps } from "@/lib/plaid/sync-runner";

/**
 * The native pull's bank refresh (POST /api/mobile/plaid/refresh, scheduled with `after()` so the pull never waits on
 * Plaid): asks Plaid to check each of the user's due Items now (`/transactions/refresh`). Only Items the 24-hour claim
 * hands back are called (`claimItemsDueForRefresh`, src/lib/plaid/bank-refresh.ts). Anything new arrives through the
 * usual webhook -> claimed sync path (sync-runner.ts). Never throws: a failed claim or Plaid call is logged (codes only,
 * `describePlaidError`) and otherwise ignored, since the pull has already re-read the user's data.
 */
export async function refreshBankItems(userId: string): Promise<void> {
  try {
    const due = await claimItemsDueForRefresh(db(), userId);
    if (due.length === 0) return;

    const tokenEncKey = loadPlaidConfig().tokenEncKey;
    const client = plaidClient();
    const results = await Promise.allSettled(
      due.map((item) => client.transactionsRefresh({ access_token: decryptToken(item.accessTokenEnc, tokenEncKey) })),
    );
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error("[plaid] bank refresh failed", { itemId: due[i].itemId, ...describePlaidError(r.reason) });
      }
    });
  } catch (e) {
    console.error("[plaid] bank refresh failed", { userId, ...describePlaidError(e) });
  }
}

/** Fetch the JWK for a webhook JWT `kid` (cached per process). */
const keyCache = new Map<string, JWK>();
export async function getWebhookVerificationKey(kid: string): Promise<JWK | null> {
  const cached = keyCache.get(kid);
  if (cached) return cached;
  const res = await plaidClient().webhookVerificationKeyGet({ key_id: kid });
  const key = res.data.key as unknown as JWK | undefined;
  if (key) keyCache.set(kid, key);
  return key ?? null;
}

/** The signed-in user's own item access token, decrypted — for Link update mode. */
export async function accessTokenForUserItem(userId: string, itemId: string): Promise<string | null> {
  const item = await findUserItem(db(), userId, itemId);
  if (!item) return null;
  return decryptToken(item.accessTokenEnc, loadPlaidConfig().tokenEncKey);
}

/** The sync runner's deps over the real singletons. */
export function syncRunner(): SyncRunnerDeps {
  return plaidSyncRunnerDeps({ db: db(), client: plaidClient(), tokenEncKey: loadPlaidConfig().tokenEncKey });
}

/**
 * Time budget for background sync work inside one invocation. Kept well under
 * the Plaid routes' `maxDuration` (300s) so an in-flight Item finishes before
 * the platform kills the function; whatever is left stays `needs_sync` for the
 * next trigger or the sweep.
 */
export const SYNC_BUDGET_MS = 200_000;

/** Background drain of one Item's pending work (webhook, and follow-up pages
 * after a user-requested sync). Never throws — it runs inside `after()`, so
 * any failure, including building the runner (missing DB or Plaid config), is
 * logged instead. */
export async function drainItemInBackground(itemId: string): Promise<void> {
  try {
    const deps = syncRunner();
    await drainItem(deps, itemId, { kind: "due" }, deps.now() + SYNC_BUDGET_MS);
  } catch (e) {
    console.error("[plaid] background drain failed", { itemId, ...describePlaidError(e) });
  }
}
