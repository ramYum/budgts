/**
 * Server-only wiring for the Plaid route handlers: the RLS-bypassed DB handle,
 * webhook-key fetch, the user's-own-item access token (reconnect), and the
 * one-item sync runner with the real singletons. `import "server-only"` keeps
 * this out of any client bundle and out of the Vitest unit layer (these paths
 * are covered by the Plaid-integration / E2E layers). Design §6, §20–22.
 */
import "server-only";
import type { JWK } from "jose";
import { db } from "@/lib/db";
import { plaidClient } from "@/lib/plaid/client";
import { loadPlaidConfig } from "@/lib/plaid/config";
import { decryptToken } from "@/lib/plaid/crypto";
import { findUserItem, type PlaidItemRecord } from "@/lib/plaid/item-store";
import { syncItem as runItemSync, type SyncItemResult } from "@/lib/plaid/sync-item";

export const plaidDb = db;
export type { SyncItemResult };

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

export function syncItem(item: PlaidItemRecord): Promise<SyncItemResult> {
  return runItemSync({ db, client: plaidClient(), item, tokenEncKey: loadPlaidConfig().tokenEncKey });
}
