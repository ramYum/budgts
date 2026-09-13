import { describe, expect, it } from "vitest";
import { buildDashboard, type DashboardCategory } from "./dashboard";
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
  it("computes the five tiles", () => {
    const { tiles } = buildDashboard(txns, cats, budgets, "2026-09");
    expect(tiles).toEqual({
      income: 500000,
      spent: 55000, // 340 + 200 + 10
      netSavings: 445000,
      budgeted: 75000,
      leftToSpend: 20000, // 75000 - 55000
    });
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
});
