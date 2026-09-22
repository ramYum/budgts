/**
 * Native read models — the explicit view-models behind `GET /api/mobile/{accounts,categories,transactions,budgets}`
 * (docs/specs/2026-09-21-mobile-only-transition-design.md §4A). Same pattern as `home.ts`: server-side, RLS-scoped through the
 * caller's own Supabase client, a projection of authoritative data, never a raw row, money in integer minor units. Where a web
 * page already has a visibility rule (archived accounts, removed / duplicate bank rows, disconnected banks) it is applied here
 * identically so the two surfaces can never disagree about what a ledger contains.
 *
 * A read that fails throws (the route answers a generic 503): a partial list would silently misstate the user's money.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectableAccounts, type SelectableAccountRow } from "@/lib/accounts/selectable-accounts";
import type { MonthlyDashboard } from "@/lib/budget/home-data";
import type { MobileHomeCategory } from "@/lib/mobile/home";

export const MOBILE_API_VERSION = 1;

// ─── accounts ────────────────────────────────────────────────────────────────

export type MobileAccount = {
  id: string;
  name: string;
  type: string;
  source: "manual" | "plaid";
  archived: boolean;
  /** May a manual transaction be entered against it (see `selectableAccounts`)? */
  selectable: boolean;
};

export async function loadAccounts(supabase: SupabaseClient, plaidOn: boolean): Promise<MobileAccount[]> {
  const [accounts, links] = await Promise.all([
    supabase.from("accounts").select("id, name, type, source, is_archived").order("name"),
    plaidOn
      ? supabase.from("plaid_accounts").select("account_id").not("account_id", "is", null)
      : Promise.resolve({ data: [] as { account_id: string | null }[], error: null }),
  ]);
  if (accounts.error || links.error) throw new Error("accounts_read_failed");

  const rows = (accounts.data ?? []) as (SelectableAccountRow & { type: string; is_archived: boolean })[];
  const live = new Set(
    ((links.data ?? []) as { account_id: string | null }[]).map((l) => l.account_id).filter((id): id is string => id != null),
  );
  const selectable = new Set(selectableAccounts(rows, live).map((a) => a.id));

  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    source: a.source,
    archived: a.is_archived,
    selectable: !a.is_archived && selectable.has(a.id),
  }));
}

// ─── categories ──────────────────────────────────────────────────────────────

export type MobileCategory = { id: string; name: string; kind: "expense" | "income"; color: string };

export async function loadCategories(supabase: SupabaseClient): Promise<MobileCategory[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, kind, color")
    .eq("is_archived", false)
    .order("kind")
    .order("name");
  if (error) throw new Error("categories_read_failed");
  return (data ?? []) as MobileCategory[];
}

// ─── budgets ─────────────────────────────────────────────────────────────────

export type MobileBudgets = {
  version: typeof MOBILE_API_VERSION;
  /** `YYYY-MM` (UTC). */
  month: string;
  currency: string;
  budgeted: number;
  spent: number;
  leftToSpend: number;
  /** One per expense category, in the dashboard's own order. Copied from the authoritative budget-vs-actual, never recomputed. */
  categories: MobileHomeCategory[];
};

export function buildMobileBudgets({ month, dash }: { month: string; dash: MonthlyDashboard }): MobileBudgets {
  const { tiles, bars } = dash.view;
  return {
    version: MOBILE_API_VERSION,
    month,
    currency: dash.currency,
    budgeted: tiles.budgeted,
    spent: tiles.spent,
    leftToSpend: tiles.leftToSpend,
    categories: bars.map((b) => ({
      id: b.categoryId,
      name: b.name,
      color: b.color,
      budget: b.budget,
      actual: b.actual,
      remaining: b.remaining,
      pctUsed: b.pctUsed,
      state: b.state,
    })),
  };
}

// ─── transactions ────────────────────────────────────────────────────────────

export type MobileTransaction = {
  id: string;
  amount: number;
  direction: "debit" | "credit";
  occurredAt: string;
  description: string;
  note: string | null;
  isTransfer: boolean;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string };
  /** No category and not a transfer — the "needs a category" prompt. */
  uncategorized: boolean;
};

export type TransactionsPage = { items: MobileTransaction[]; nextCursor: string | null };

export type TransactionsCursor = { occurredAt: string; id: string };

// The cursor's fields are interpolated into a PostgREST `or()` filter, so they are validated strictly: anything that is not a
// plain ISO timestamp and a UUID is refused, which also rules out smuggling extra filter clauses through a forged cursor.
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(c: TransactionsCursor): string {
  return Buffer.from(JSON.stringify({ occurredAt: c.occurredAt, id: c.id })).toString("base64url");
}

export function decodeCursor(raw: string): TransactionsCursor | null {
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<TransactionsCursor>;
    if (typeof v.occurredAt !== "string" || typeof v.id !== "string") return null;
    if (!ISO_TS.test(v.occurredAt) || !UUID.test(v.id)) return null;
    return { occurredAt: v.occurredAt, id: v.id };
  } catch {
    return null;
  }
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
}

/** Escapes `\`, `%` and `_` so user text is matched literally by `ilike`. */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type TransactionsQuery = {
  /** `YYYY-MM` (UTC), validated by the route. */
  month: string;
  categoryId?: string | null;
  search?: string | null;
  limit: number;
  cursor?: TransactionsCursor | null;
  plaidOn: boolean;
};

type Row = {
  id: string;
  amount: number;
  direction: "debit" | "credit";
  occurred_at: string;
  description: string;
  note: string | null;
  is_transfer: boolean;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string };
};

export async function loadTransactionsPage(supabase: SupabaseClient, q: TransactionsQuery): Promise<TransactionsPage> {
  const { start, end } = monthBounds(q.month);

  let query = supabase
    .from("transactions")
    .select(
      "id, amount, direction, occurred_at, description, note, is_transfer, category:categories(id,name,color), account:accounts!inner(id,name,is_archived)",
    )
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    // Same rules as the web ledger (`transactions/page.tsx`): archived accounts stay out of the default view...
    .eq("account.is_archived", false);
  // ...and, where Plaid is on: soft-deleted bank rows, confirmed duplicates, and rows of a bank the owner deliberately
  // disconnected are not transactions to show. (Those columns exist only where the Plaid migrations have run.)
  if (q.plaidOn) {
    query = query.is("removed_at", null).is("duplicate_of_id", null).or("source.neq.bank,plaid_account_id.not.is.null");
  }
  if (q.categoryId) query = query.eq("category_id", q.categoryId);
  if (q.search) query = query.ilike("description", `%${likeLiteral(q.search)}%`);
  if (q.cursor) {
    query = query.or(
      `occurred_at.lt.${q.cursor.occurredAt},and(occurred_at.eq.${q.cursor.occurredAt},id.lt.${q.cursor.id})`,
    );
  }

  const { data, error } = await query
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(q.limit + 1); // one extra row tells us whether another page exists
  if (error) throw new Error("transactions_read_failed");

  const rows = (data ?? []) as unknown as Row[];
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];

  return {
    items: page.map((r) => ({
      id: r.id,
      amount: r.amount,
      direction: r.direction,
      occurredAt: r.occurred_at,
      description: r.description,
      note: r.note,
      isTransfer: r.is_transfer,
      category: r.category ? { id: r.category.id, name: r.category.name, color: r.category.color } : null,
      account: { id: r.account.id, name: r.account.name },
      uncategorized: r.category === null && !r.is_transfer,
    })),
    nextCursor: rows.length > q.limit && last ? encodeCursor({ occurredAt: last.occurred_at, id: last.id }) : null,
  };
}
