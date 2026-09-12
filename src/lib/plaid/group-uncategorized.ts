/**
 * Groups the "Needs a category" list by merchant so a single decision can
 * clear every transaction from that merchant at once — the same merchant
 * identity (`merchant_entity_id`) the backfill in
 * `categorizeBankTransaction` already keys on, so grouping here carries no
 * extra mis-categorization risk beyond what that backfill already does.
 *
 * Pure, no I/O — the caller resolves `suggested_category_id` up front (it
 * needs the user's category lookup) and just hands in plain data.
 */

export interface UncategorizedTxn {
  id: string;
  description: string;
  merchant_name: string | null;
  merchant_entity_id: string | null;
  amount: number;
  direction: "debit" | "credit";
  occurred_at: string;
  account_name: string | null;
  pending: boolean;
  plaid_category_primary: string | null;
  /** Resolved by the caller via `suggestPlaidCategory` — a hint, never auto-applied. */
  suggested_category_id: string | null;
}

export interface MerchantGroup {
  /** `merchant_entity_id`, or a description-based fallback when Plaid gave none. */
  key: string;
  /** Display name — the merchant name, or the raw description as a fallback. */
  label: string;
  /** Most recently occurred transaction's id — the row submitted to `categorizeBankTransaction`. */
  anchorId: string;
  count: number;
  /** Debits add, credits subtract — net spend for the group. */
  netAmount: number;
  plaidCategoryPrimary: string | null;
  suggestedCategoryId: string | null;
  /** Newest first. */
  transactions: UncategorizedTxn[];
}

export function groupUncategorized(items: UncategorizedTxn[]): MerchantGroup[] {
  const byKey = new Map<string, UncategorizedTxn[]>();
  for (const it of items) {
    const key = it.merchant_entity_id || `desc:${(it.merchant_name || it.description).trim().toLowerCase()}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(it);
    else byKey.set(key, [it]);
  }

  const groups: MerchantGroup[] = [...byKey.entries()].map(([key, txns]) => {
    const sorted = [...txns].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    const first = sorted[0];
    const netAmount = sorted.reduce((sum, t) => sum + (t.direction === "debit" ? t.amount : -t.amount), 0);
    return {
      key,
      label: first.merchant_name || first.description || "Transaction",
      anchorId: first.id,
      count: sorted.length,
      netAmount,
      plaidCategoryPrimary: first.plaid_category_primary,
      suggestedCategoryId: first.suggested_category_id,
      transactions: sorted,
    };
  });

  groups.sort((a, b) => b.count - a.count || b.transactions[0].occurred_at.localeCompare(a.transactions[0].occurred_at));
  return groups;
}
