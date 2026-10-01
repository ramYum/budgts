import { describe, expect, it } from "vitest";
import { parseBudgets } from "./budgets-api";

const category = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  name: "Groceries",
  color: "#0f0",
  budget: 40000,
  actual: 12000,
  remaining: 28000,
  pctUsed: 30,
  state: "under",
  previousActual: 9000,
  ...over,
});

const month = (over: Record<string, unknown> = {}) => ({
  version: 1,
  range: "month",
  month: "2026-09",
  currency: "USD",
  budgeted: 40000,
  spent: 15000,
  budgetedSpent: 12000,
  spentOutsideBudgets: 3000,
  leftToSpend: 28000,
  spentPct: 30,
  tone: "under",
  suggestion: null,
  categories: [category()],
  unbudgetedCategories: [{ id: "c2", name: "Dining", color: "#f00" }],
  ...over,
});

describe("parseBudgets (server buildMobileBudgets / buildMobileBudgetsAllTime)", () => {
  it("accepts the month contract, tolerating unknown fields", () => {
    const parsed = parseBudgets({ ...month({ categories: [{ ...category(), newField: 1 }] }), extra: true });
    expect(parsed).toEqual({
      range: "month",
      month: "2026-09",
      currency: "USD",
      budgeted: 40000,
      spent: 15000,
      budgetedSpent: 12000,
      spentOutsideBudgets: 3000,
      leftToSpend: 28000,
      spentPct: 30,
      tone: "under",
      suggestion: null,
      categories: [category()],
      unbudgetedCategories: [{ id: "c2", name: "Dining", color: "#f00" }],
    });
  });

  it("keeps the server's percentages as percentages (pctUsed 30 is 30%, uncapped past 100)", () => {
    const parsed = parseBudgets(month({ spentPct: 142.5, tone: "over", categories: [category({ pctUsed: 142.5, state: "over" })] }));
    if (parsed.range !== "month") throw new Error("range");
    expect(parsed.spentPct).toBe(142.5);
    expect(parsed.categories[0].pctUsed).toBe(142.5);
  });

  it("reads both suggestion kinds", () => {
    const u = parseBudgets(month({ suggestion: { kind: "unbudgeted", categoryId: "c2", name: "Dining", amount: 5000, share: 29 } }));
    const m = parseBudgets(month({ suggestion: { kind: "mover", categoryId: "c1", name: "Groceries", amount: 12000, delta: 3000 } }));
    expect(u.range === "month" && u.suggestion).toEqual({ kind: "unbudgeted", categoryId: "c2", name: "Dining", amount: 5000, share: 29 });
    expect(m.range === "month" && m.suggestion).toEqual({ kind: "mover", categoryId: "c1", name: "Groceries", amount: 12000, delta: 3000 });
  });

  it("accepts the all-time contract", () => {
    const parsed = parseBudgets({
      version: 1,
      range: "all",
      month: "2026-09",
      currency: "EUR",
      allTime: [{ categoryId: "c1", name: "Groceries", color: "#0f0", total: 123456 }],
    });
    expect(parsed).toEqual({
      range: "all",
      month: "2026-09",
      currency: "EUR",
      allTime: [{ categoryId: "c1", name: "Groceries", color: "#0f0", total: 123456 }],
    });
  });

  it.each([
    ["a fractional money amount", { budgeted: 400.5 }],
    ["an unknown budget state", { categories: [category({ state: "great" })] }],
    ["an unknown range", { range: "week" }],
    ["a missing currency", { currency: undefined }],
    ["a missing hero tone", { tone: undefined }],
    ["a missing budgetedSpent", { budgetedSpent: undefined }],
    ["a fractional budgetedSpent", { budgetedSpent: 12000.5 }],
    ["a missing spentOutsideBudgets", { spentOutsideBudgets: undefined }],
    ["a fractional spentOutsideBudgets", { spentOutsideBudgets: 3000.25 }],
    ["categories that are not a list", { categories: {} }],
    ["an unknown suggestion kind", { suggestion: { kind: "other", categoryId: "c", name: "n", amount: 1 } }],
  ])("rejects %s", (_name, over) => {
    expect(() => parseBudgets(month(over))).toThrow();
  });
});
