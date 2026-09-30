import { describe, expect, it } from "vitest";
import { parseInsights } from "./insights-api";

const body = (over: Record<string, unknown> = {}) => ({
  version: 1,
  month: "2026-09",
  currency: "USD",
  moneyLeft: 120000,
  income: 500000,
  spent: 380000,
  savingsRate: 0.24,
  previousSavingsRate: 0.2,
  savingsRateDelta: 4,
  incomeSources: [{ name: "Salary", color: "#0f0", amount: 500000, share: 100 }],
  suggestion: null,
  breakdown: [{ name: "Housing", amount: 200000, share: 53 }],
  trend: [
    { month: "2026-08", spend: 350000 },
    { month: "2026-09", spend: 380000 },
  ],
  trendChange: { total: 380000, delta: 30000, previousMonth: "2026-08" },
  ...over,
});

describe("parseInsights (server buildMobileInsights)", () => {
  it("accepts the contract, tolerating unknown fields", () => {
    const p = parseInsights({ ...body(), extra: 1 });
    expect(p).toMatchObject({ month: "2026-09", moneyLeft: 120000, savingsRate: 0.24, savingsRateDelta: 4 });
    expect(p.incomeSources).toEqual([{ name: "Salary", color: "#0f0", amount: 500000, share: 100 }]);
    expect(p.trendChange).toEqual({ total: 380000, delta: 30000, previousMonth: "2026-08" });
  });

  it("keeps a month with no income as nulls, and a negative money left", () => {
    const p = parseInsights(body({ income: 0, moneyLeft: -5000, savingsRate: null, savingsRateDelta: null, trendChange: { total: 5000, delta: null, previousMonth: null } }));
    expect(p.savingsRate).toBeNull();
    expect(p.savingsRateDelta).toBeNull();
    expect(p.moneyLeft).toBe(-5000);
    expect(p.trendChange.delta).toBeNull();
  });

  it("reads the suggestion", () => {
    const s = { kind: "mover", categoryId: "c", name: "Dining", amount: 13000, delta: 3000 };
    expect(parseInsights(body({ suggestion: s })).suggestion).toEqual(s);
  });

  it.each([
    ["a fractional amount", { spent: 1.5 }],
    ["a missing trend change", { trendChange: undefined }],
    ["income sources that are not a list", { incomeSources: {} }],
  ])("rejects %s", (_n, over) => {
    expect(() => parseInsights(body(over))).toThrow();
  });
});
