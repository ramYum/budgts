import { describe, expect, it } from "vitest";
import { priorMonths, spendTrend } from "./spend-trend";
import type { BudgetCategory, BudgetTxn } from "./types";

const cats: BudgetCategory[] = [
  { id: "groceries", kind: "expense" },
  { id: "salary", kind: "income" },
];

function txn(over: Partial<BudgetTxn>): BudgetTxn {
  return {
    categoryId: "groceries",
    amount: 1000,
    direction: "debit",
    occurredAt: new Date("2026-09-10T12:00:00Z"),
    status: "confirmed",
    isTransfer: false,
    duplicateOfId: null,
    eventRole: null,
    transferUserSet: false,
    accountExcluded: false,
    ...over,
  };
}

describe("priorMonths", () => {
  it("returns `count` months ending at `end`, oldest first", () => {
    expect(priorMonths("2026-09", 6)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("crosses a year boundary", () => {
    expect(priorMonths("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("count of 1 returns just the end month", () => {
    expect(priorMonths("2026-09", 1)).toEqual(["2026-09"]);
  });
});

describe("spendTrend", () => {
  it("computes one spend total per month, in the given month order", () => {
    const txns = [
      txn({ occurredAt: new Date("2026-07-05T12:00:00Z"), amount: 5000 }),
      txn({ occurredAt: new Date("2026-08-05T12:00:00Z"), amount: 7000 }),
      txn({ occurredAt: new Date("2026-09-05T12:00:00Z"), amount: 3000 }),
    ];
    const trend = spendTrend(txns, cats, ["2026-07", "2026-08", "2026-09"]);
    expect(trend).toEqual([
      { month: "2026-07", spend: 5000 },
      { month: "2026-08", spend: 7000 },
      { month: "2026-09", spend: 3000 },
    ]);
  });

  it("a month with no transactions is zero, not missing", () => {
    const txns = [txn({ occurredAt: new Date("2026-09-05T12:00:00Z"), amount: 3000 })];
    const trend = spendTrend(txns, cats, ["2026-08", "2026-09"]);
    expect(trend).toEqual([
      { month: "2026-08", spend: 0 },
      { month: "2026-09", spend: 3000 },
    ]);
  });

  it("ignores transfers and income, same as rollup", () => {
    const txns = [
      txn({ occurredAt: new Date("2026-09-05T12:00:00Z"), amount: 3000, isTransfer: true }),
      txn({
        occurredAt: new Date("2026-09-06T12:00:00Z"),
        amount: 500000,
        direction: "credit",
        categoryId: "salary",
      }),
    ];
    const trend = spendTrend(txns, cats, ["2026-09"]);
    expect(trend).toEqual([{ month: "2026-09", spend: 0 }]);
  });
});
