/**
 * The full CSV of a user's transactions (a plain-text backup): one implementation behind the web download
 * (`/api/export/transactions`, cookie session) and the native `GET /api/mobile/export/transactions` (Bearer). Moved
 * verbatim out of the web route (2026-09-29, Stage 2B). The caller supplies the user's Supabase client (RLS scopes the read
 * to that user). A failed read throws: a truncated "full backup" would be worse than none.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

type ExportRow = {
  occurred_at: string;
  description: string;
  note: string | null;
  amount: number;
  direction: string;
  is_transfer: boolean;
  status: string;
  source: string;
  category: { name: string } | null;
  account: { name: string } | null;
};

function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection when a cell starts with = + - @ tab or CR.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function transactionsCsv(supabase: SupabaseClient, plaidEnabled: boolean): Promise<string> {
  // fetchAllRows, not a bare await: this is a full-history export with no
  // date bound at all — the query most at risk of PostgREST's default
  // 1000-row cap. A truncated "full backup" that silently drops rows past
  // #1000 would be worse than no export at all. See fetch-all-rows.ts.
  const data = await fetchAllRows<ExportRow>((from, to, count) => {
    let q = supabase
      .from("transactions")
      .select(
        "occurred_at, description, note, amount, direction, is_transfer, status, source, category:categories(name), account:accounts(name)",
        { count },
      );
    // Skip soft-deleted bank rows. Guarded: column only exists where 0004 has run.
    if (plaidEnabled) q = q.is("removed_at", null);
    return q.order("occurred_at", { ascending: false }).order("id", { ascending: false }).range(from, to) as never;
  });

  const header = [
    "date",
    "description",
    "note",
    "amount",
    "direction",
    "transfer",
    "status",
    "source",
    "category",
    "account",
  ];
  const rows = data.map((t) => [
    t.occurred_at?.slice(0, 10) ?? "",
    t.description ?? "",
    t.note ?? "",
    (t.amount / 100).toFixed(2),
    t.direction,
    t.is_transfer ? "yes" : "no",
    t.status,
    t.source,
    t.category?.name ?? "",
    t.account?.name ?? "",
  ]);

  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** The download's headers; the file is dated with the user's own today (a late-evening export isn't dated tomorrow). */
export function csvDownloadHeaders(today: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="budgts-transactions-${today}.csv"`,
    "Cache-Control": "private, no-store",
  };
}
