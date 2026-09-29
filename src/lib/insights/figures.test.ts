import { describe, expect, it } from "vitest";
import type { DashboardBar } from "@/lib/budget/dashboard";
import { BREAKDOWN_SLICES, savingsRateDelta, sharesOf, spendingBreakdown, trendChange } from "./figures";

const bar = (name: string, actual: number): DashboardBar => ({
  categoryId: `id-${name}`,
  name,
  color: "#000",
  budget: 0,
  actual,
  remaining: -actual,
  pctUsed: 0,
  state: "under",
});

describe("sharesOf", () => {
  it("whole percents that always add up to 100 (largest remainder)", () => {
    expect(sharesOf([1, 1, 1])).toEqual([34, 33, 33]);
    expect(sharesOf([500, 250, 250])).toEqual([50, 25, 25]);
    expect(sharesOf([0, 0])).toEqual([0, 0]);
  });
});

describe("spendingBreakdown", () => {
  it("shows every slice when five or fewer, largest first, with uncategorised spend as Other", () => {
    const slices = spendingBreakdown([bar("Housing", 5000), bar("Food / Groceries", 3000)], 10000);
    expect(slices).toEqual([
      { name: "Housing", amount: 5000, share: 50 },
      { name: "Food / Groceries", amount: 3000, share: 30 },
      { name: "Other", amount: 2000, share: 20 },
    ]);
  });

  it("folds everything past the four largest named slices into Other", () => {
    const bars = ["Transportation", "Personal Care", "Food / Groceries", "Insurances", "Entertainment", "Housing"].map((n, i) =>
      bar(n, (i + 1) * 1000),
    );
    const slices = spendingBreakdown(bars, 21000);
    expect(slices).toHaveLength(BREAKDOWN_SLICES);
    expect(slices.map((s) => s.name)).toEqual(["Housing", "Entertainment", "Insurances", "Food / Groceries", "Other"]);
    expect(slices.at(-1)!.amount).toBe(3000);
    expect(slices.reduce((s, x) => s + x.share, 0)).toBe(100);
  });

  it("is empty when nothing was spent", () => {
    expect(spendingBreakdown([bar("Housing", 0)], 0)).toEqual([]);
  });
});

describe("trendChange / savingsRateDelta", () => {
  it("the month's spend and its change against the previous month", () => {
    expect(trendChange([{ month: "2026-08", spend: 700 }, { month: "2026-09", spend: 1000 }])).toEqual({
      total: 1000,
      delta: 300,
      previousMonth: "2026-08",
    });
    expect(trendChange([{ month: "2026-09", spend: 1000 }])).toEqual({ total: 1000, delta: null, previousMonth: null });
  });

  it("whole points, or null when either month had no income", () => {
    expect(savingsRateDelta(0.3, 0.2)).toBe(10);
    expect(savingsRateDelta(0.1, 0.25)).toBe(-15);
    expect(savingsRateDelta(null, 0.2)).toBeNull();
    expect(savingsRateDelta(0.1, null)).toBeNull();
  });
});
