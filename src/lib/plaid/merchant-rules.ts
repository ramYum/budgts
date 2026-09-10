/**
 * Per-merchant category memory (`plaid_merchant_rules`, design §18).
 *
 * When the user corrects the category on a bank transaction, we remember
 * `(merchant_entity_id → category_id)` so every future transaction from that
 * merchant is auto-categorised. `buildResolveCategory` composes that memory in
 * front of the static PFC map for the sync `NormalizeCtx`.
 */
import { and, eq } from "drizzle-orm";
import { plaidMerchantRules } from "@/lib/db/schema";
import { type CategoryLookup, resolvePlaidCategory } from "./category-map";
import type { PlaidDb } from "./sync-store";
import type { NormalizeCtx } from "./types";

/** `merchant_entity_id` → `category_id` for one user. */
export type MerchantRuleMap = ReadonlyMap<string, string>;

export async function loadMerchantRules(db: PlaidDb, userId: string): Promise<MerchantRuleMap> {
  const rows = await db
    .select({ entity: plaidMerchantRules.merchantEntityId, category: plaidMerchantRules.categoryId })
    .from(plaidMerchantRules)
    .where(eq(plaidMerchantRules.userId, userId));
  return new Map(rows.map((r) => [r.entity, r.category]));
}

/** Remember (or re-point) a merchant → category rule. */
export async function upsertMerchantRule(
  db: PlaidDb,
  userId: string,
  merchantEntityId: string,
  categoryId: string,
): Promise<void> {
  await db
    .insert(plaidMerchantRules)
    .values({ userId, merchantEntityId, categoryId })
    .onConflictDoUpdate({
      target: [plaidMerchantRules.userId, plaidMerchantRules.merchantEntityId],
      set: { categoryId, updatedAt: new Date() },
    });
}

export async function deleteMerchantRule(db: PlaidDb, userId: string, merchantEntityId: string): Promise<void> {
  await db
    .delete(plaidMerchantRules)
    .where(and(eq(plaidMerchantRules.userId, userId), eq(plaidMerchantRules.merchantEntityId, merchantEntityId)));
}

/**
 * Compose the `resolveCategory` used by the sync `NormalizeCtx`: merchant
 * memory first, then the deterministic PFC map.
 */
export function buildResolveCategory(deps: {
  merchantRules: MerchantRuleMap;
  categoryLookup: CategoryLookup;
}): NormalizeCtx["resolveCategory"] {
  return ({ merchantEntityId, primary, detailed, confidence }) => {
    if (merchantEntityId) {
      const remembered = deps.merchantRules.get(merchantEntityId);
      if (remembered) return remembered;
    }
    return resolvePlaidCategory(primary, detailed, confidence, deps.categoryLookup);
  };
}
