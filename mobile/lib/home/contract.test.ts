import { describe, expect, it } from "vitest";
import { HomeContractError, parseMobileHome } from "./contract";

const valid = {
  version: 1,
  month: "2026-09",
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

  it("rejects an unknown version so an old app never mis-renders a newer contract", () => {
    expect(() => parseMobileHome({ ...valid, version: 2 })).toThrow(HomeContractError);
  });

  it.each([
    ["not an object", null],
    ["a string", "nope"],
    ["missing moneyLeft", { ...valid, moneyLeft: undefined }],
    ["fractional money (must be integer minor units)", { ...valid, spent: 12.5 }],
    ["string money", { ...valid, income: "320000" }],
    ["bad month", { ...valid, month: "September" }],
    ["categories not an array", { ...valid, categories: {} }],
    ["bad budget state", { ...valid, categories: [{ ...valid.categories[0], state: "weird" }] }],
    ["bad direction", { ...valid, recent: [{ ...valid.recent[0], direction: "sideways" }] }],
    ["bad savings shape", { ...valid, savings: { activeCount: "1" } }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseMobileHome(input)).toThrow(HomeContractError);
  });
});
