import { describe, expect, it } from "vitest";
import { fakeSupabase, has } from "../../../tests/unit/helpers/fake-supabase";
import { csvDownloadHeaders, transactionsCsv } from "./transactions-csv";

const ROWS = [
  {
    occurred_at: "2026-09-10T12:00:00+00:00",
    description: "=HYPERLINK(evil)",
    note: 'said "hi", then left',
    amount: 1234,
    direction: "debit",
    is_transfer: false,
    status: "confirmed",
    source: "manual",
    category: { name: "Food" },
    account: { name: "Wallet" },
  },
  {
    occurred_at: "2026-09-09T12:00:00+00:00",
    description: "Move",
    note: null,
    amount: 50000,
    direction: "debit",
    is_transfer: true,
    status: "confirmed",
    source: "bank",
    category: null,
    account: null,
  },
];

describe("transactionsCsv", () => {
  it("writes every row, neutralising formulas and quoting commas and quotes", async () => {
    const { supabase, log } = fakeSupabase(() => ({ data: ROWS, count: ROWS.length }));
    const csv = await transactionsCsv(supabase, true);
    expect(csv.split("\r\n")).toEqual([
      "date,description,note,amount,direction,transfer,status,source,category,account",
      `2026-09-10,'=HYPERLINK(evil),"said ""hi"", then left",12.34,debit,no,confirmed,manual,Food,Wallet`,
      "2026-09-09,Move,,500.00,debit,yes,confirmed,bank,,",
      "",
    ]);
    const calls = log[0]!.calls;
    expect(has(calls, "is", "removed_at", null)).toBe(true);
    expect(calls.some((c) => c[0] === "range")).toBe(true);
  });

  it("throws instead of writing a truncated backup", async () => {
    const { supabase } = fakeSupabase(() => ({ error: { message: "x" } }));
    await expect(transactionsCsv(supabase, false)).rejects.toThrow();
  });

  it("names the file with the user's own date and never lets it be cached", () => {
    expect(csvDownloadHeaders("2026-10-01")).toEqual({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="budgts-transactions-2026-10-01.csv"',
      "Cache-Control": "private, no-store",
    });
  });
});
