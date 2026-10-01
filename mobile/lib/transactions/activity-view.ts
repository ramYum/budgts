import { formatDayHeading, formatMoney } from "../shared";
import type { MobileTransaction } from "./transactions-api";

/**
 * The Activity list's presentation rules, as the web's `src/components/transaction-list.tsx` applies them to the month's
 * rows: the search + kind filter, the day bands with each day's net, and each row's meta line. Display only: every amount is
 * the server's, and a day's net is the sum of the rows listed under it, exactly as the web band shows it.
 */

export type ActivityKind = "all" | "spending" | "income" | "transfers";

export const KIND_OPTIONS: { value: ActivityKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "spending", label: "Spending" },
  { value: "income", label: "Income" },
  { value: "transfers", label: "Transfers" },
];

/** Rows rendered at first, and added each time the reader nears the end (the web's SLICE). */
export const SLICE = 60;

/** The web's filter: the search matches the description or the category name; the kind splits transfers, money in, money out. */
export function filterActivity(items: MobileTransaction[], search: string, kind: ActivityKind): MobileTransaction[] {
  const q = search.trim().toLowerCase();
  return items.filter((it) => {
    if (q) {
      const haystack = `${it.description} ${it.category?.name ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (kind === "transfers") return it.isTransfer;
    if (kind === "income") return !it.isTransfer && it.direction === "credit";
    if (kind === "spending") return !it.isTransfer && it.direction === "debit";
    return true;
  });
}

/** The stored UTC calendar day of a row, the key the web groups by. */
export const dayKey = (iso: string) => iso.slice(0, 10);

/** Rows in their day bands, in list order (newest first, as the server sends them). */
export function groupByDay(rows: MobileTransaction[]): { day: string; rows: MobileTransaction[] }[] {
  const groups = new Map<string, MobileTransaction[]>();
  for (const it of rows) {
    const key = dayKey(it.occurredAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(it);
    else groups.set(key, [it]);
  }
  return [...groups.entries()].map(([day, dayRows]) => ({ day, rows: dayRows }));
}

/** Each day's net across every matching row (not just the rendered slice): money in minus money out. */
export function dayTotals(filtered: MobileTransaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const it of filtered) {
    const day = dayKey(it.occurredAt);
    totals.set(day, (totals.get(day) ?? 0) + (it.direction === "credit" ? it.amount : -it.amount));
  }
  return totals;
}

/** A day band's net: "+$12.00", "−$4.50", "$0.00". */
export function signedTotal(minor: number, currency: string): string {
  return `${minor > 0 ? "+" : minor < 0 ? "−" : ""}${formatMoney(Math.abs(minor), currency)}`;
}

/** "Tue, Sep 29" for a `YYYY-MM-DD` day (the web's own heading formatter). */
export const dayLabel = (day: string, locale?: string): string => formatDayHeading(day, locale);

/** The row's title: its description, else its category, else "Transaction". */
export function rowTitle(t: MobileTransaction): string {
  return t.description || t.category?.name || "Transaction";
}

/**
 * The row's second line: "Transfer", "Needs a category" (warn tone), or the category, with " · Refund" when money came back
 * into a spending category. `kinds` maps a category id to its kind (from the user's categories).
 */
export function rowMeta(t: MobileTransaction, kinds: Map<string, "expense" | "income">): { text: string; warn: boolean } {
  const needsCategory = !t.isTransfer && !t.category;
  const refund = !t.isTransfer && t.direction === "credit" && !!t.category && kinds.get(t.category.id) === "expense";
  const base = t.isTransfer ? "Transfer" : needsCategory ? "Needs a category" : (t.category?.name ?? "");
  return { text: `${base}${refund ? " · Refund" : ""}`, warn: needsCategory };
}

/** "−$12.34" / "+$12.34". */
export function rowAmount(t: MobileTransaction, currency: string): string {
  return `${t.direction === "debit" ? "−" : "+"}${formatMoney(t.amount, currency)}`;
}

/**
 * After a create that may have been a replay (an earlier try's answer was lost), the saved row is opened so the person sees
 * what the server kept. `since` is the ledger page on screen when the save answered: the decision waits for a newer read
 * (the refresh the save triggers). Found → open it; the fresh month is complete without it (saved to another month) →
 * drop, the documented limitation; otherwise wait.
 */
export function revealAfterSave(
  ledger: { status: string; page?: { items: MobileTransaction[] }; cursor?: string | null },
  pending: { id: string; since: unknown },
): { open: MobileTransaction } | "wait" | "drop" {
  if (ledger.status !== "ready" || !ledger.page || ledger.page === pending.since) return "wait";
  const row = ledger.page.items.find((t) => t.id === pending.id);
  if (row) return { open: row };
  return ledger.cursor === null ? "drop" : "wait";
}
