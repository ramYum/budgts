/**
 * Which accounts belong in a manual transaction-entry dropdown (Add income,
 * Add transaction). A Plaid-derived account only qualifies while it still has
 * a live `plaid_accounts` link — disconnecting a bank deletes that link but
 * deliberately keeps the `accounts` row (so past transactions stay attached),
 * so `source` alone can't tell "currently connected" from "used to be." A
 * manual account (never Plaid) always qualifies.
 */
export interface SelectableAccountRow {
  id: string;
  name: string;
  source: "manual" | "plaid";
}

export function selectableAccounts(
  accounts: readonly SelectableAccountRow[],
  liveLinkedAccountIds: ReadonlySet<string>,
): { id: string; name: string }[] {
  return accounts
    .filter((a) => a.source === "manual" || liveLinkedAccountIds.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }));
}
