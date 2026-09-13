import { describe, expect, it } from "vitest";
import { buildDashboard, type DashboardCategory } from "./dashboard";
import { savingsRate } from "./savings-rate";
import type { BudgetTxn, CategoryBudget } from "./types";

const cats: DashboardCategory[] = [
  { id: "groceries", kind: "expense", name: "Food / Groceries", color: "#22c55e" },
  { id: "transport", kind: "expense", name: "Transportation", color: "#3b82f6" },
  { id: "fun", kind: "expense", name: "Date / Entertainment", color: "#f97316" },
  { id: "salary", kind: "income", name: "Salary", color: "#16a34a" },
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

// groceries: 340 of 400 -> 85% -> near
// transport: 200 of 150 -> over
// fun:       10  of 200 -> under
const txns = [
  txn({ categoryId: "groceries", amount: 34000 }),
  txn({ categoryId: "transport", amount: 20000 }),
  txn({ categoryId: "fun", amount: 1000 }),
  txn({ categoryId: "salary", amount: 500000, direction: "credit" }),
];
const budgets: CategoryBudget[] = [
  { categoryId: "groceries", amount: 40000 },
  { categoryId: "transport", amount: 15000 },
  { categoryId: "fun", amount: 20000 },
];

describe("buildDashboard", () => {
  it("computes the six tiles", () => {
    const { tiles } = buildDashboard(txns, cats, budgets, "2026-09");
    expect(tiles).toEqual({
      income: 500000,
      spent: 55000, // 340 + 200 + 10
      netSavings: 445000,
      budgeted: 75000,
      leftToSpend: 20000, // 75000 - 55000
      savingsRate: 0.89, // 445000 / 500000
    });
  });

  // Money Left / Savings Rate design §14 item 12.
  it("test 12: savingsRate matches savingsRate(income, netSavings) directly", () => {
    const { tiles } = buildDashboard(txns, cats, budgets, "2026-09");
    expect(tiles.savingsRate).toBe(savingsRate(tiles.income, tiles.netSavings));
  });

  // Money Left / Savings Rate design §14 item 13.
  it("test 13: a month with zero income produces savingsRate: null, not 0", () => {
    const noIncome = [txn({ categoryId: "groceries", amount: 5000 })];
    const { tiles } = buildDashboard(noIncome, cats, budgets, "2026-09");
    expect(tiles.income).toBe(0);
    expect(tiles.savingsRate).toBeNull();
  });

  it("emits one bar per expense category with name and colour joined, income excluded", () => {
    const { bars } = buildDashboard(txns, cats, budgets, "2026-09");
    expect(bars).toHaveLength(3);
    expect(bars.every((b) => b.name && b.color)).toBe(true);
    expect(bars.find((b) => b.categoryId === "salary")).toBeUndefined();
  });

  it("sorts problem categories first: over, then near, then under", () => {
    const { bars } = buildDashboard(txns, cats, budgets, "2026-09");
    expect(bars.map((b) => b.state)).toEqual(["over", "near", "under"]);
    expect(bars[0].categoryId).toBe("transport");
  });

  it("ignores transfers and other months in the tiles", () => {
    const noisy = [
      ...txns,
      txn({ categoryId: "groceries", amount: 99999, isTransfer: true }),
      txn({ categoryId: "groceries", amount: 88888, occurredAt: new Date("2026-08-01T12:00:00Z") }),
    ];
    expect(buildDashboard(noisy, cats, budgets, "2026-09").tiles.spent).toBe(55000);
  });

  it("excludes an accountExcluded row from every tile, including Savings Rate (design: 2026-09-13 Advancial containment)", () => {
    const noisy = [
      ...txns,
      txn({ categoryId: "groceries", amount: 999999, accountExcluded: true }),
      txn({ categoryId: "salary", amount: 888888, direction: "credit", accountExcluded: true }),
    ];
    const view = buildDashboard(noisy, cats, budgets, "2026-09");
    const clean = buildDashboard(txns, cats, budgets, "2026-09");
    expect(view.tiles.spent).toBe(clean.tiles.spent);
    expect(view.tiles.income).toBe(clean.tiles.income);
    expect(view.tiles.netSavings).toBe(clean.tiles.netSavings);
    expect(view.tiles.savingsRate).toBe(clean.tiles.savingsRate);
  });

  it("a non-excluded account continues to calculate normally alongside an excluded one — regression guard", () => {
    const mixed = [...txns, txn({ categoryId: "groceries", amount: 5000, accountExcluded: false })];
    expect(buildDashboard(mixed, cats, budgets, "2026-09").tiles.spent).toBe(55000 + 5000);
  });
});
