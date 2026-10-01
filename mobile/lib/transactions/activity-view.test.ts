import { describe, expect, it } from "vitest";
import {
  KIND_OPTIONS,
  dayLabel,
  dayTotals,
  filterActivity,
  groupByDay,
  rowAmount,
  rowMeta,
  revealAfterSave,
  rowTitle,
  signedTotal,
} from "./activity-view";
import type { MobileTransaction } from "./transactions-api";

const txn = (id: string, over: Partial<MobileTransaction> = {}): MobileTransaction => ({
  id,
  amount: 1000,
  direction: "debit",
  occurredAt: "2026-09-10T12:00:00+00:00",
  description: `Txn ${id}`,
  note: null,
  isTransfer: false,
  category: { id: "groceries", name: "Groceries", color: "#000" },
  account: { id: "a1", name: "Everyday checking" },
  source: "manual",
  uncategorized: false,
  ...over,
});

const rows = [
  txn("spend", { description: "Trader Joe's" }),
  txn("pay", { direction: "credit", description: "Payroll", category: { id: "salary", name: "Salary", color: "#000" } }),
  txn("move", { isTransfer: true, category: null, description: "To savings" }),
  txn("refund", { direction: "credit", description: "Return" }),
  txn("uncat", { category: null, uncategorized: true, description: "SQ *COFFEE" }),
];

describe("filterActivity (web transaction-list.tsx)", () => {
  it("offers All, Spending, Income, Transfers in the web's order", () => {
    expect(KIND_OPTIONS.map((o) => o.label)).toEqual(["All", "Spending", "Income", "Transfers"]);
  });

  it("splits by kind exactly as the web: transfers, money in that isn't a transfer, money out that isn't", () => {
    const ids = (k: Parameters<typeof filterActivity>[2]) => filterActivity(rows, "", k).map((t) => t.id);
    expect(ids("all")).toEqual(["spend", "pay", "move", "refund", "uncat"]);
    expect(ids("spending")).toEqual(["spend", "uncat"]);
    expect(ids("income")).toEqual(["pay", "refund"]);
    expect(ids("transfers")).toEqual(["move"]);
  });

  it("searches the description and the category name, case-insensitively, trimmed", () => {
    expect(filterActivity(rows, "  trader ", "all").map((t) => t.id)).toEqual(["spend"]);
    expect(filterActivity(rows, "GROCER", "all").map((t) => t.id)).toEqual(["spend", "refund"]);
    expect(filterActivity(rows, "salary", "income").map((t) => t.id)).toEqual(["pay"]);
    expect(filterActivity(rows, "salary", "spending")).toEqual([]);
  });
});

describe("day bands", () => {
  const month = [
    txn("a", { occurredAt: "2026-09-12T12:00:00+00:00", amount: 500 }),
    txn("b", { occurredAt: "2026-09-12T12:00:00+00:00", amount: 2000, direction: "credit" }),
    txn("c", { occurredAt: "2026-09-11T12:00:00+00:00", amount: 250 }),
  ];

  it("groups by the stored UTC day, in list order", () => {
    expect(groupByDay(month).map((g) => [g.day, g.rows.map((t) => t.id)])).toEqual([
      ["2026-09-12", ["a", "b"]],
      ["2026-09-11", ["c"]],
    ]);
  });

  it("nets each day across every row given (money in minus money out)", () => {
    expect(Object.fromEntries(dayTotals(month))).toEqual({ "2026-09-12": 1500, "2026-09-11": -250 });
  });

  it("signs the net like the web band", () => {
    expect(signedTotal(1500, "USD")).toBe("+$15.00");
    expect(signedTotal(-250, "USD")).toBe("−$2.50");
    expect(signedTotal(0, "USD")).toBe("$0.00");
  });

  it("labels the day as the web does (weekday, month, day, in UTC)", () => {
    expect(dayLabel("2026-09-29", "en-US")).toBe("Tue, Sep 29");
  });
});

describe("a row", () => {
  const kinds = new Map<string, "expense" | "income">([
    ["groceries", "expense"],
    ["salary", "income"],
  ]);

  it("reads Transfer, Needs a category (warn), or the category, marking money back into spending as a refund", () => {
    expect(rowMeta(rows[0]!, kinds)).toEqual({ text: "Groceries", warn: false });
    expect(rowMeta(rows[1]!, kinds)).toEqual({ text: "Salary", warn: false });
    expect(rowMeta(rows[2]!, kinds)).toEqual({ text: "Transfer", warn: false });
    expect(rowMeta(rows[3]!, kinds)).toEqual({ text: "Groceries · Refund", warn: false });
    expect(rowMeta(rows[4]!, kinds)).toEqual({ text: "Needs a category", warn: true });
  });

  it("titles itself by description, then category, then 'Transaction'", () => {
    expect(rowTitle(txn("x", { description: "" }))).toBe("Groceries");
    expect(rowTitle(txn("x", { description: "", category: null }))).toBe("Transaction");
  });

  it("signs the amount by direction", () => {
    expect(rowAmount(rows[0]!, "USD")).toBe("−$10.00");
    expect(rowAmount(rows[1]!, "USD")).toBe("+$10.00");
  });
});

describe("revealAfterSave (open the row a retried create kept)", () => {
  const before = { items: [txn("a")] };
  it("waits for a read newer than the one on screen when the save answered", () => {
    expect(revealAfterSave({ status: "ready", page: before, cursor: null }, { id: "new", since: before })).toBe("wait");
    expect(revealAfterSave({ status: "loading" }, { id: "new", since: before })).toBe("wait");
  });
  it("opens the saved row once the refreshed month has it", () => {
    const after = { items: [txn("new"), txn("a")] };
    expect(revealAfterSave({ status: "ready", page: after, cursor: "c1" }, { id: "new", since: before })).toEqual({ open: after.items[0] });
  });
  it("keeps waiting while the month is still arriving, and drops it once complete without it (saved to another month)", () => {
    const after = { items: [txn("a")] };
    expect(revealAfterSave({ status: "ready", page: after, cursor: "c1" }, { id: "new", since: before })).toBe("wait");
    expect(revealAfterSave({ status: "ready", page: after, cursor: null }, { id: "new", since: before })).toBe("drop");
  });
});
