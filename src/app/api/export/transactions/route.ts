import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";

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

/** Full CSV of the signed-in user's transactions — a plain-text backup. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select(
      "occurred_at, description, note, amount, direction, is_transfer, status, source, category:categories(name), account:accounts(name)",
    )
    .order("occurred_at", { ascending: false });
  // Skip soft-deleted bank rows. Guarded: column only exists where 0004 has run.
  if (plaidUiEnabled()) query = query.is("removed_at", null);
  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });

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
  const rows = ((data ?? []) as unknown as ExportRow[]).map((t) => [
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

  const csv =
    [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="budgts-transactions-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
