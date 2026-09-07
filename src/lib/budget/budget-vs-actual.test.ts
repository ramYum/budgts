import { describe, expect, it } from "vitest";
import { budgetVsActual } from "./budget-vs-actual";
import type { BudgetCategory, CategoryBudget } from "./types";

const groceries: BudgetCategory = { id: "groceries", kind: "expense" };
const salary: BudgetCategory = { id: "salary", kind: "income" };

function run(
  categories: BudgetCategory[],
  budgets: CategoryBudget[],
  actuals: [string | null, number][],
) {
  return budgetVsActual(categories, budgets, new Map(actuals));
}

describe("budgetVsActual", () => {
  it("reports an under-budget category", () => {
    const [row] = run([groceries], [{ categoryId: "groceries", amount: 10000 }], [["groceries", 5000]]);
    expect(row).toMatchObject({ budget: 10000, actual: 5000, remaining: 5000, pctUsed: 50, state: "under" });
  });

  it("flags 'near' from 80% up to 100% inclusive", () => {
    const [at85] = run([groceries], [{ categoryId: "groceries", amount: 10000 }], [["groceries", 8500]]);
    const [at100] = run([groceries], [{ categoryId: "groceries", amount: 10000 }], [["groceries", 10000]]);
    expect(at85.state).toBe("near");
    expect(at100.state).toBe("near");
    expect(at100.pctUsed).toBe(100);
  });

  it("flags 'over' above 100% and reports negative remaining", () => {
    const [row] = run([groceries], [{ categoryId: "groceries", amount: 10000 }], [["groceries", 12000]]);
    expect(row).toMatchObject({ remaining: -2000, pctUsed: 120, state: "over" });
  });

  it("clamps pctUsed to 0 when the net actual is negative (refunds)", () => {
    const [row] = run([groceries], [{ categoryId: "groceries", amount: 10000 }], [["groceries", -2000]]);
    expect(row).toMatchObject({ actual: -2000, remaining: 12000, pctUsed: 0, state: "under" });
  });

  it("treats spend with no budget as 'over'", () => {
    const [row] = run([groceries], [], [["groceries", 3000]]);
    expect(row).toMatchObject({ budget: 0, actual: 3000, remaining: -3000, pctUsed: 0, state: "over" });
  });

  it("includes a budgeted category with no spend", () => {
    const [row] = run([groceries], [{ categoryId: "groceries", amount: 5000 }], []);
    expect(row).toMatchObject({ budget: 5000, actual: 0, remaining: 5000, state: "under" });
  });

  it("excludes income categories", () => {
    const rows = run([groceries, salary], [], [["groceries", 100]]);
    expect(rows.map((r) => r.categoryId)).toEqual(["groceries"]);
  });

  it("never emits a row for the uncategorized bucket", () => {
    const rows = run([groceries], [], [[null, 999]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryId).toBe("groceries");
  });
});
