import { bool, int, list, obj, oneOf, optStr, str } from "../api/parse";

/**
 * The response contract of `GET /api/mobile/transactions` (server source of truth: `src/lib/mobile/reads.ts`,
 * `src/app/api/mobile/transactions/route.ts`). Mirrored and validated at runtime because `mobile/` cannot import server code.
 * Money is integer minor units. Unknown extra fields are ignored so a server-side addition never breaks an installed app.
 */
export type Direction = "debit" | "credit";

export type MobileTransaction = {
  id: string;
  amount: number;
  direction: Direction;
  /** ISO timestamp as stored; the calendar day is its first 10 characters (UTC), like the web ledger. */
  occurredAt: string;
  description: string;
  note: string | null;
  isTransfer: boolean;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string };
  /** No category and not a transfer — the "needs a category" prompt. */
  uncategorized: boolean;
};

export type TransactionsPage = { month: string; items: MobileTransaction[]; nextCursor: string | null };

function parseTransaction(v: unknown, i: number): MobileTransaction {
  const t = obj(v, `transactions[${i}]`);
  const category = t.category === null || t.category === undefined ? null : obj(t.category, "category");
  const account = obj(t.account, "account");
  return {
    id: str(t.id, "id"),
    amount: int(t.amount, "amount"),
    direction: oneOf(t.direction, "direction", ["debit", "credit"] as const),
    occurredAt: str(t.occurredAt, "occurredAt"),
    description: str(t.description, "description"),
    note: optStr(t.note, "note"),
    isTransfer: bool(t.isTransfer, "isTransfer"),
    category: category ? { id: str(category.id, "category.id"), name: str(category.name, "category.name"), color: str(category.color, "category.color") } : null,
    account: { id: str(account.id, "account.id"), name: str(account.name, "account.name") },
    uncategorized: bool(t.uncategorized, "uncategorized"),
  };
}

export function parseTransactionsPage(body: unknown): TransactionsPage {
  const b = obj(body, "transactions page");
  return {
    month: str(b.month, "month"),
    items: list(b.items, "items", parseTransaction),
    nextCursor: optStr(b.nextCursor, "nextCursor"),
  };
}

/** Appends the next page. A row that appears in both (something was added while paging) is shown once. */
export function mergePages(previous: TransactionsPage, next: TransactionsPage): TransactionsPage {
  const seen = new Set(previous.items.map((t) => t.id));
  return {
    month: previous.month,
    items: [...previous.items, ...next.items.filter((t) => !seen.has(t.id))],
    nextCursor: next.nextCursor,
  };
}

export type TransactionsQuery = {
  month: string;
  category?: string | null;
  search?: string | null;
  cursor?: string | null;
  limit?: number;
};

export function transactionsPath(q: TransactionsQuery): string {
  const params = new URLSearchParams({ month: q.month });
  if (q.category) params.set("category", q.category);
  if (q.search) params.set("search", q.search);
  if (q.cursor) params.set("cursor", q.cursor);
  if (q.limit) params.set("limit", String(q.limit));
  return `/api/mobile/transactions?${params.toString()}`;
}
