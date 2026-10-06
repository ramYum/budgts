/**
 * Native read models — the explicit view-models behind `GET /api/mobile/{accounts,categories,transactions,budgets}`
 * (docs/specs/2026-09-17-mobile-app-launch-design.md §6). Same pattern as `home.ts`: server-side, RLS-scoped through the
 * caller's own Supabase client, a projection of authoritative data, never a raw row, money in integer minor units. Where a web
 * page already has a visibility rule (archived accounts, removed / duplicate bank rows, disconnected banks) it is applied here
 * identically so the two surfaces can never disagree about what a ledger contains.
 *
 * A read that fails throws (the route answers a generic 503): a partial list would silently misstate the user's money.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectableAccounts, type SelectableAccountRow } from "@/lib/accounts/selectable-accounts";
import type { AllTimeRow, BudgetsAllTimeData, BudgetsMonthData } from "@/lib/budgets/load-budgets";
import { isHeld } from "@/lib/budget/held";
import type { TxnStatus } from "@/lib/budget/types";
import { budgetProgress } from "@/lib/insights/figures";
import { pickSuggestion, type Suggestion } from "@/lib/insights/suggestion";
import { mobileCategories, type MobileHomeCategory } from "@/lib/mobile/home";

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

export type MobileBudgetCategory = MobileHomeCategory & {
  /** What the category spent last month (the detail sheet's comparison); 0 when nothing. */
  previousActual: number;
};

export type MobileBudgets = {
  version: typeof MOBILE_API_VERSION;
  range: "month";
  /** `YYYY-MM`. */
  month: string;
  currency: string;
  budgeted: number;
  /** All of the month's spending (`tiles.spent`). */
  spent: number;
  /** Spending in the categories that have a budget: the hero's "spent of budgeted" (added 2026-10-01). */
  budgetedSpent: number;
  /** `spent − budgetedSpent`: the hero's "spent outside your budgets" line, shown when above zero (added 2026-10-01). */
  spentOutsideBudgets: number;
  /** `budgeted − budgetedSpent`; negative when over ("Over by"). */
  leftToSpend: number;
  /** The hero bar: the share of the budget spent (uncapped) and its tone, from the web card's own rule. */
  spentPct: number;
  tone: "over" | "near" | "under";
  /** The unplanned-spending note ("X has no budget"), or a mover; the same pick the web Budgets page makes. */
  suggestion: Suggestion | null;
  /** One per expense category, in the dashboard's own order. Copied from the authoritative budget-vs-actual, never recomputed. */
  categories: MobileBudgetCategory[];
  /** Expense categories with no budget yet (what "Add a budget" offers), by name. */
  unbudgetedCategories: { id: string; name: string; color: string }[];
};

export type MobileBudgetsAllTime = {
  version: typeof MOBILE_API_VERSION;
  range: "all";
  month: string;
  currency: string;
  /** Every expense category's spending across the user's whole history, largest first (categories with none are left out). */
  allTime: AllTimeRow[];
};

export function buildMobileBudgets(
  data: Pick<BudgetsMonthData, "month" | "currency" | "view" | "prevView" | "unbudgeted">,
): MobileBudgets {
  const { tiles } = data.view;
  const { spentPct, tone } = budgetProgress(tiles);
  const previous = new Map(data.prevView.bars.map((b) => [b.categoryId, b.actual]));
  return {
    version: MOBILE_API_VERSION,
    range: "month",
    month: data.month,
    currency: data.currency,
    budgeted: tiles.budgeted,
    spent: tiles.spent,
    budgetedSpent: tiles.budgetedSpent,
    spentOutsideBudgets: tiles.spentOutsideBudgets,
    leftToSpend: tiles.leftToSpend,
    spentPct,
    tone,
    suggestion: pickSuggestion(data.view.bars, data.prevView.bars, tiles.spent),
    categories: mobileCategories(data).map((c) => ({ ...c, previousActual: previous.get(c.id) ?? 0 })),
    unbudgetedCategories: data.unbudgeted.map((c) => ({ id: c.id, name: c.name, color: c.color })),
  };
}

export function buildMobileBudgetsAllTime(data: BudgetsAllTimeData): MobileBudgetsAllTime {
  return {
    version: MOBILE_API_VERSION,
    range: "all",
    month: data.month,
    currency: data.currency,
    allTime: data.allTimeRows.map((r) => ({ categoryId: r.categoryId, name: r.name, color: r.color, total: r.total })),
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
  /** Where the row came from; a `bank` row keeps its account on edit (owner decision 2026-09-30). */
  source: "manual" | "bank" | "email" | "receipt";
  /** No category and not a transfer — the "needs a category" prompt. */
  uncategorized: boolean;
  /** Held (`pending_review`): listed, but counted in no total until it is released (added 2026-10-05). */
  held: boolean;
  /** Why a held row is held (`sign_convention_unknown` / `currency_mismatch`); null on every row that is not held. */
  heldReason: string | null;
};

export type TransactionsPage = { items: MobileTransaction[]; nextCursor: string | null };

/** A row's position in the web ledger's order: occurred_at, then created_at, then id, all newest first. */
export type TransactionsCursor = { occurredAt: string; createdAt: string; id: string };

// The cursor's fields are interpolated into a PostgREST `or()` filter, so they are validated strictly: anything that is not a
// plain ISO timestamp (twice) and a UUID is refused, which also rules out smuggling extra filter clauses through a forged cursor.
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(c: TransactionsCursor): string {
  return Buffer.from(JSON.stringify({ occurredAt: c.occurredAt, createdAt: c.createdAt, id: c.id })).toString("base64url");
}

export function decodeCursor(raw: string): TransactionsCursor | null {
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<TransactionsCursor>;
    if (typeof v.occurredAt !== "string" || typeof v.createdAt !== "string" || typeof v.id !== "string") return null;
    if (!ISO_TS.test(v.occurredAt) || !ISO_TS.test(v.createdAt) || !UUID.test(v.id)) return null;
    return { occurredAt: v.occurredAt, createdAt: v.createdAt, id: v.id };
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

export type TransactionsQuery = {
  /** `YYYY-MM`, validated by the route. Month bounds are UTC, exactly like the web ledger's. */
  month: string;
  categoryId?: string | null;
  limit: number;
  cursor?: TransactionsCursor | null;
  plaidOn: boolean;
};

type Row = {
  id: string;
  amount: number;
  direction: "debit" | "credit";
  occurred_at: string;
  created_at: string;
  source: MobileTransaction["source"];
  description: string;
  note: string | null;
  is_transfer: boolean;
  status: TxnStatus;
  pending_reason: string | null;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string };
};

export async function loadTransactionsPage(supabase: SupabaseClient, q: TransactionsQuery): Promise<TransactionsPage> {
  const { start, end } = monthBounds(q.month);

  let query = supabase
    .from("transactions")
    .select(
      "id, amount, direction, occurred_at, created_at, source, description, note, is_transfer, status, pending_reason, category:categories(id,name,color), account:accounts!inner(id,name,is_archived)",
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
  // The web ledger's order (`transactions/page.tsx`): occurred_at, then created_at, then id, newest first. Manual entries on
  // one day share occurred_at (noon UTC), so created_at is what orders them; the keyset follows the same three columns.
  if (q.cursor) {
    const { occurredAt: o, createdAt: c, id } = q.cursor;
    query = query.or(
      `occurred_at.lt.${o},and(occurred_at.eq.${o},created_at.lt.${c}),and(occurred_at.eq.${o},created_at.eq.${c},id.lt.${id})`,
    );
  }

  const { data, error } = await query
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
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
      source: r.source,
      uncategorized: r.category === null && !r.is_transfer,
      held: isHeld(r.status),
      heldReason: isHeld(r.status) ? r.pending_reason : null,
    })),
    nextCursor: rows.length > q.limit && last ? encodeCursor({ occurredAt: last.occurred_at, createdAt: last.created_at, id: last.id }) : null,
  };
}
