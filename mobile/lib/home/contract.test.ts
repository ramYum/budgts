import { describe, expect, it } from "vitest";
import { HomeContractError, parseMobileHome } from "./contract";

const valid = {
  version: 1,
  month: "2026-09",
  today: "2026-09-19",
  currency: "USD",
  moneyLeft: 145146,
  income: 320000,
  spent: 174854,
  budgeted: 191000,
  leftToSpend: 16146,
  savingsRate: 0.4536,
  categories: [
    {
      id: "c1",
      name: "Food / Groceries",
      color: "#3FA772",
      budget: 22000,
      actual: 18555,
      remaining: 3445,
      pctUsed: 84,
      state: "near",
    },
  ],
  recent: [
    {
      id: "t1",
      description: "Whole Foods Market",
      amount: 3980,
      direction: "debit",
      occurredAt: "2026-09-16T12:00:00.000Z",
      isTransfer: false,
      category: { name: "Food / Groceries", color: "#3FA772" },
    },
  ],
  savings: { activeCount: 1, totalSaved: 42000, totalTarget: 100000 },
  bankConnected: true,
  suggestion: { kind: "mover", categoryId: "c1", name: "Food / Groceries", amount: 18555, delta: 4200 },
  breakdown: [{ name: "Food / Groceries", amount: 18555, share: 100 }],
  trend: [
    { month: "2026-08", spend: 150000 },
    { month: "2026-09", spend: 174854 },
  ],
  trendChange: { total: 174854, delta: 24854, previousMonth: "2026-08" },
  expenseCategories: [{ id: "c1", name: "Food / Groceries" }],
};

describe("parseMobileHome", () => {
  it("accepts a well-formed v1 payload unchanged", () => {
    expect(parseMobileHome(structuredClone(valid))).toEqual(valid);
  });

  it("accepts null savings, null savings rate, an uncategorised recent row, and empty lists", () => {
    const home = parseMobileHome({
      ...valid,
      savingsRate: null,
      savings: null,
      categories: [],
      recent: [{ ...valid.recent[0], category: null }],
    });
    expect(home.savings).toBeNull();
    expect(home.savingsRate).toBeNull();
    expect(home.recent[0]!.category).toBeNull();
  });

  it("reads the unbudgeted suggestion, and no suggestion and bank connections switched off as null", () => {
    const unbudgeted = { kind: "unbudgeted", categoryId: "c2", name: "Fun", amount: 5000, share: 12 };
    expect(parseMobileHome({ ...valid, suggestion: unbudgeted }).suggestion).toEqual(unbudgeted);
    const off = parseMobileHome({ ...valid, suggestion: null, bankConnected: null });
    expect(off.suggestion).toBeNull();
    expect(off.bankConnected).toBeNull();
  });

  it("reads a first month's trend headline: no change and no previous month", () => {
    const home = parseMobileHome({ ...valid, breakdown: [], trendChange: { total: 0, delta: null, previousMonth: null } });
    expect(home.trendChange).toEqual({ total: 0, delta: null, previousMonth: null });
    expect(home.breakdown).toEqual([]);
  });

  it("rejects an unknown version so an old app never mis-renders a newer contract", () => {
    expect(() => parseMobileHome({ ...valid, version: 2 })).toThrow(HomeContractError);
  });

  // The server's pctUsed is (actual / budget) × 100, unrounded (src/lib/budget/budget-vs-actual.ts): $250 of $400 is 62.5.
  it.each([62.5, 100 / 3, 0.1, 0, 150])("accepts a category's pctUsed of %s as sent", (pctUsed) => {
    const home = parseMobileHome({ ...valid, categories: [{ ...valid.categories[0], pctUsed }] });
    expect(home.categories[0]!.pctUsed).toBe(pctUsed);
  });

  it.each([
    ["not an object", null],
    ["a non-finite pctUsed", { ...valid, categories: [{ ...valid.categories[0], pctUsed: Number.POSITIVE_INFINITY }] }],
    ["a NaN pctUsed", { ...valid, categories: [{ ...valid.categories[0], pctUsed: Number.NaN }] }],
    ["a string pctUsed", { ...valid, categories: [{ ...valid.categories[0], pctUsed: "62.5" }] }],
    ["a category's fractional budget (money stays integer minor units)", { ...valid, categories: [{ ...valid.categories[0], budget: 400.5 }] }],
    ["a category's fractional actual", { ...valid, categories: [{ ...valid.categories[0], actual: 250.5 }] }],
    ["a string", "nope"],
    ["missing moneyLeft", { ...valid, moneyLeft: undefined }],
    ["fractional money (must be integer minor units)", { ...valid, spent: 12.5 }],
    ["string money", { ...valid, income: "320000" }],
    ["bad month", { ...valid, month: "September" }],
    ["categories not an array", { ...valid, categories: {} }],
    ["bad budget state", { ...valid, categories: [{ ...valid.categories[0], state: "weird" }] }],
    ["bad direction", { ...valid, recent: [{ ...valid.recent[0], direction: "sideways" }] }],
    ["bad savings shape", { ...valid, savings: { activeCount: "1" } }],
    ["trend not an array", { ...valid, trend: null }],
    ["fractional breakdown share", { ...valid, breakdown: [{ name: "x", amount: 1, share: 1.5 }] }],
    ["missing trendChange", { ...valid, trendChange: undefined }],
    ["missing expenseCategories", { ...valid, expenseCategories: undefined }],
    ["expense category without a name", { ...valid, expenseCategories: [{ id: "c1" }] }],
    ["bankConnected not a boolean", { ...valid, bankConnected: "yes" }],
    ["unknown suggestion kind", { ...valid, suggestion: { ...valid.suggestion, kind: "other" } }],
    ["fractional suggestion amount", { ...valid, suggestion: { ...valid.suggestion, amount: 1.5 } }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseMobileHome(input)).toThrow(HomeContractError);
  });
});
