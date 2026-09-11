/**
 * Per-merchant category memory (`plaid_merchant_rules`, design §18) + the
 * deterministic categorization **evidence chain** it fronts.
 *
 * When the user corrects the category on a bank transaction, we remember
 * `(merchant_entity_id → category_id)` so every future transaction from that
 * merchant is auto-categorised. `buildResolveCategory` composes that memory as
 * resolver R1 of the chain (see the function's doc).
 */
import { and, eq } from "drizzle-orm";
import { plaidMerchantRules } from "@/lib/db/schema";
import { type CategoryLookup, resolvePlaidCategory, resolveTrustedDetailed } from "./category-map";
import { resolveMerchantKnowledge } from "./merchant-knowledge";
import { normalizeMerchantName } from "./merchant-name";
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
 * Compose the `resolveCategory` used by the sync `NormalizeCtx` — a pure,
 * deterministic evidence chain (design §18). First non-null wins:
 *
 *  R1  user merchant rule       — `plaid_merchant_rules[merchant_entity_id]`.
 *                                 Always wins; even an unusual user choice.
 *  R2  Budgts merchant knowledge — `MERCHANT_KNOWLEDGE[normalizeMerchantName(
 *                                 merchantName ?? description)]`. Ignores Plaid
 *                                 confidence (that is the point — obvious
 *                                 merchants at LOW confidence still categorise).
 *  R3  trusted PFC detailed     — `resolveTrustedDetailed(detailed)`. Ignores
 *                                 Plaid confidence for specific-enough subtypes.
 *  R4  gated PFC primary        — `resolvePlaidCategory(primary, detailed,
 *                                 confidence)`. KEEPS the LOW/UNKNOWN gate; may
 *                                 throw `UnknownPfcPrimaryError` (adapter
 *                                 catches it).
 *
 * No fuzzy matching, no scoring, no I/O — the DB only supplies `deps`.
 */
export function buildResolveCategory(deps: {
  merchantRules: MerchantRuleMap;
  categoryLookup: CategoryLookup;
}): NormalizeCtx["resolveCategory"] {
  return ({ merchantEntityId, merchantName, description, primary, detailed, confidence }) => {
    // R1 — user merchant rule
    if (merchantEntityId) {
      const remembered = deps.merchantRules.get(merchantEntityId);
      if (remembered) return remembered;
    }
    // R2 — Budgts merchant knowledge (name-keyed; confidence-agnostic)
    const nameKey = normalizeMerchantName(merchantName ?? description);
    const known = resolveMerchantKnowledge(nameKey, deps.categoryLookup);
    if (known) return known;
    // R3 — trusted PFC detailed subtype (confidence-agnostic)
    const trusted = resolveTrustedDetailed(detailed, deps.categoryLookup);
    if (trusted) return trusted;
    // R4 — gated PFC primary fallback
    return resolvePlaidCategory(primary, detailed, confidence, deps.categoryLookup);
  };
}
