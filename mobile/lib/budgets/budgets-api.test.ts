import { describe, expect, it } from "vitest";
import { parseBudgets } from "./budgets-api";

const category = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  name: "Groceries",
  color: "#0f0",
  budget: 40000,
  actual: 12000,
  remaining: 28000,
  pctUsed: 0.3,
  state: "under",
  ...over,
});

describe("parseBudgets", () => {
  it("accepts the server contract, tolerating unknown fields", () => {
    const parsed = parseBudgets({
      version: 1,
      month: "2026-09",
      currency: "EUR",
      budgeted: 40000,
      spent: 12000,
      leftToSpend: 28000,
      categories: [{ ...category(), newField: 1 }],
      extra: true,
    });
    expect(parsed).toEqual({
      month: "2026-09",
      currency: "EUR",
      budgeted: 40000,
      spent: 12000,
      leftToSpend: 28000,
      categories: [category()],
    });
  });

  it("allows a category with no budget and no spend", () => {
    const parsed = parseBudgets({
      version: 1, month: "2026-09", currency: "USD", budgeted: 0, spent: 0, leftToSpend: 0,
      categories: [category({ budget: 0, actual: 0, remaining: 0, pctUsed: 0, state: "under" })],
    });
    expect(parsed.categories[0].budget).toBe(0);
  });

  it.each([
    ["a fractional money amount", { budgeted: 400.5 }],
    ["an unknown budget state", { categories: [category({ state: "great" })] }],
    ["a missing currency", { currency: undefined }],
    ["categories that are not a list", { categories: {} }],
  ])("rejects %s", (_name, over) => {
    expect(() =>
      parseBudgets({ version: 1, month: "2026-09", currency: "USD", budgeted: 0, spent: 0, leftToSpend: 0, categories: [], ...over }),
    ).toThrow();
  });
});
