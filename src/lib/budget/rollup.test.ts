import { describe, expect, it } from "vitest";
import { rollup } from "./rollup";
import type { BudgetCategory, BudgetTxn, CategoryBudget } from "./types";

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
    ...over,
  };
}

describe("rollup", () => {
  it("separates spend and income and nets them", () => {
    const r = rollup(
      [txn({ amount: 3000 }), txn({ categoryId: "salary", amount: 500000, direction: "credit" })],
      cats,
      [],
      "2026-09",
    );
    expect(r.spend).toBe(3000);
    expect(r.income).toBe(500000);
    expect(r.net).toBe(497000);
  });

  it("ignores transfers, unconfirmed rows, and other months", () => {
    const r = rollup(
      [
        txn({ amount: 3000 }),
        txn({ amount: 9999, isTransfer: true }),
        txn({ amount: 9999, status: "pending_review" }),
        txn({ amount: 9999, occurredAt: new Date("2026-08-15T00:00:00Z") }),
      ],
      cats,
      [],
      "2026-09",
    );
    expect(r.spend).toBe(3000);
  });

  it("excludes a confirmed-duplicate row from spend and income (design: 2026-09-12 Phase 15)", () => {
    const r = rollup(
      [
        txn({ amount: 3000 }),
        txn({ amount: 999999, duplicateOfId: "canonical-1" }),
        txn({ categoryId: "salary", direction: "credit", amount: 500000 }),
        txn({ categoryId: "salary", direction: "credit", amount: 888888, duplicateOfId: "canonical-2" }),
      ],
      cats,
      [],
      "2026-09",
    );
    expect(r.spend).toBe(3000);
    expect(r.income).toBe(500000);
  });

  it("counts uncategorized debits as spend", () => {
    const r = rollup([txn({ categoryId: null, amount: 1500 })], cats, [], "2026-09");
    expect(r.spend).toBe(1500);
  });

  it("nets refunds against spend", () => {
    const r = rollup(
      [txn({ amount: 2000 }), txn({ amount: 800, direction: "credit" })],
      cats,
      [],
      "2026-09",
    );
    expect(r.spend).toBe(1200);
  });

  it("reduces income when an income category is debited", () => {
    const r = rollup(
      [txn({ categoryId: "salary", amount: 500000, direction: "credit" }), txn({ categoryId: "salary", amount: 50000 })],
      cats,
      [],
      "2026-09",
    );
    expect(r.income).toBe(450000);
  });

  it("sums all budget rows into totalBudgeted", () => {
    const budgets: CategoryBudget[] = [
      { categoryId: "groceries", amount: 40000 },
      { categoryId: "transport", amount: 15000 },
    ];
    const r = rollup([], cats, budgets, "2026-09");
    expect(r.totalBudgeted).toBe(55000);
  });

  it("computes totalRemaining against expense-category actuals only, not uncategorized", () => {
    const budgets: CategoryBudget[] = [{ categoryId: "groceries", amount: 40000 }];
    const r = rollup(
      [txn({ categoryId: "groceries", amount: 10000 }), txn({ categoryId: null, amount: 5000 })],
      cats,
      budgets,
      "2026-09",
    );
    expect(r.spend).toBe(15000); // includes the uncategorized 5000
    expect(r.totalRemaining).toBe(30000); // 40000 - 10000; uncategorized excluded
  });

  it("returns zeros for an empty month", () => {
    expect(rollup([], cats, [], "2026-09")).toEqual({
      income: 0,
      spend: 0,
      net: 0,
      totalBudgeted: 0,
      totalRemaining: 0,
    });
  });
});
