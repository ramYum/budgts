/**
 * Server-only wiring for the Plaid route handlers: the RLS-bypassed DB handle,
 * webhook-key fetch, the user's-own-item access token (reconnect), and the
 * one-item sync runner with the real singletons. `import "server-only"` keeps
 * this out of any client bundle and out of the Vitest unit layer (these paths
 * are covered by the Plaid-integration / E2E layers). Design §6, §20–22.
 */
import "server-only";
import type { JWK } from "jose";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { plaidItems } from "@/lib/db/schema";
import { plaidClient } from "@/lib/plaid/client";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { decryptToken } from "@/lib/plaid/crypto";
import { findUserItem } from "@/lib/plaid/item-store";
import { drainItem, plaidSyncRunnerDeps, type SyncRunnerDeps } from "@/lib/plaid/sync-runner";

export const plaidDb = db;

/** Throttle for {@link nudgeRefresh} — see its docstring. */
export const REFRESH_THROTTLE_MS = 25 * 60 * 1000;

/**
 * Ask Plaid to check each of the user's active Items right now
 * (`/transactions/refresh`), throttled to once per `REFRESH_THROTTLE_MS` per
 * Item. Called from page loads via `after()` so it never blocks rendering —
 * it's a nudge, not a wait: if Plaid finds anything new it arrives via the
 * existing webhook -> claimed sync path (sync-runner.ts), same as any other update.
 *
 * The throttle matters for two reasons, not just Plaid's own rate limits: some
 * institutions (Item Debugger calls this "Classic" integration) refresh via a
 * simulated login rather than a live API, so calling this too often risks
 * tripping the bank's own fraud detection on the user's real account.
 *
 * The UPDATE...RETURNING is the throttle gate itself: it atomically claims
 * only the Items actually due, so concurrent page loads (multiple tabs, or
 * the dashboard and transactions pages both loading) can't double-fire.
 * Never throws — a failed refresh call is logged and otherwise ignored, since
 * it's best-effort by nature.
 */
export async function nudgeRefresh(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - REFRESH_THROTTLE_MS);
  const due = await db
    .update(plaidItems)
    .set({ lastRefreshRequestedAt: sql`now()` })
    .where(
      and(
        eq(plaidItems.userId, userId),
        eq(plaidItems.status, "active"),
        or(isNull(plaidItems.lastRefreshRequestedAt), lt(plaidItems.lastRefreshRequestedAt, cutoff)),
      ),
    )
    .returning({ accessTokenEnc: plaidItems.accessTokenEnc, itemId: plaidItems.itemId });

  if (due.length === 0) return;

  const tokenEncKey = loadPlaidConfig().tokenEncKey;
  const client = plaidClient();
  const results = await Promise.allSettled(
    due.map((item) => client.transactionsRefresh({ access_token: decryptToken(item.accessTokenEnc, tokenEncKey) })),
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error("[plaid] refresh nudge failed", due[i].itemId, r.reason);
  });
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
  const item = await findUserItem(db, userId, itemId);
  if (!item) return null;
  return decryptToken(item.accessTokenEnc, loadPlaidConfig().tokenEncKey);
}

/** The sync runner's deps over the real singletons. */
export function syncRunner(): SyncRunnerDeps {
  return plaidSyncRunnerDeps({ db, client: plaidClient(), tokenEncKey: loadPlaidConfig().tokenEncKey });
}

/**
 * Time budget for background sync work inside one invocation. Kept well under
 * the Plaid routes' `maxDuration` (300s) so an in-flight Item finishes before
 * the platform kills the function; whatever is left stays `needs_sync` for the
 * next trigger or the sweep.
 */
export const SYNC_BUDGET_MS = 200_000;

/** Background drain of one Item's pending work (webhook, and follow-up pages
 * after a user-requested sync). Never throws — it runs inside `after()`. */
export async function drainItemInBackground(itemId: string): Promise<void> {
  const deps = syncRunner();
  await drainItem(deps, itemId, { kind: "due" }, deps.now() + SYNC_BUDGET_MS).catch((e) =>
    console.error("[plaid] background drain failed", { itemId, message: e instanceof Error ? e.message : "non-Error" }),
  );
}
