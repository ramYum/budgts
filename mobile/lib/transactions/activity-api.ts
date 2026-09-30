import { bool, int, list, obj, oneOf, optStr, str } from "../api/parse";
import type { Direction } from "./transactions-api";

/**
 * The response contract of `GET /api/mobile/activity` (server source of truth: `loadMobileActivityExtras` in
 * `src/lib/mobile/status.ts`, groups from `src/lib/plaid/group-uncategorized.ts`): the panels beside the ledger. Mirrored
 * and validated at runtime because `mobile/` cannot import server code; unknown extra fields are ignored.
 */
export type NeedsCategoryTxn = {
  id: string;
  description: string;
  amount: number;
  direction: Direction;
  occurredAt: string;
  accountName: string | null;
  pending: boolean;
};

export type NeedsCategoryGroup = {
  key: string;
  label: string;
  /** the row the categorize command is sent for (the group's newest) */
  anchorId: string;
  count: number;
  /** debits add, credits subtract: the group's net spend (server-computed) */
  netAmount: number;
  plaidCategoryPrimary: string | null;
  suggestedCategoryId: string | null;
  /** newest first */
  transactions: NeedsCategoryTxn[];
};

export type ActivityExtras = {
  plaidEnabled: boolean;
  needsCategory: NeedsCategoryGroup[];
  missingStandardCategories: string[];
  limitedHistory: string[];
};

function parseTxn(v: unknown, i: number): NeedsCategoryTxn {
  const t = obj(v, `transactions[${i}]`);
  return {
    id: str(t.id, "id"),
    description: str(t.description, "description"),
    amount: int(t.amount, "amount"),
    direction: oneOf(t.direction, "direction", ["debit", "credit"] as const),
    occurredAt: str(t.occurred_at, "occurred_at"),
    accountName: optStr(t.account_name, "account_name"),
    pending: bool(t.pending, "pending"),
  };
}

function parseGroup(v: unknown, i: number): NeedsCategoryGroup {
  const g = obj(v, `needsCategory[${i}]`);
  const transactions = list(g.transactions, "transactions", parseTxn);
  if (transactions.length === 0) throw new Error(`needsCategory[${i}] has no transactions`);
  return {
    key: str(g.key, "key"),
    label: str(g.label, "label"),
    anchorId: str(g.anchorId, "anchorId"),
    count: int(g.count, "count"),
    netAmount: int(g.netAmount, "netAmount"),
    plaidCategoryPrimary: optStr(g.plaidCategoryPrimary, "plaidCategoryPrimary"),
    suggestedCategoryId: optStr(g.suggestedCategoryId, "suggestedCategoryId"),
    transactions,
  };
}

export function parseActivityExtras(body: unknown): ActivityExtras {
  const b = obj(body, "activity");
  return {
    plaidEnabled: bool(b.plaidEnabled, "plaidEnabled"),
    needsCategory: list(b.needsCategory, "needsCategory", parseGroup),
    missingStandardCategories: list(b.missingStandardCategories, "missingStandardCategories", (v) => str(v, "name")),
    limitedHistory: list(b.limitedHistory, "limitedHistory", (v) => str(v, "message")),
  };
}
