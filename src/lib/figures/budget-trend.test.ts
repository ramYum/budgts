import { describe, expect, it } from "vitest";
import { budgetTrendPct } from "./budget-trend";

describe("budgetTrendPct (the Budgets sheet's 'vs. last month')", () => {
  it("is null when last month had no spending, so the row is left out", () => {
    expect(budgetTrendPct(12000, 0)).toBeNull();
    expect(budgetTrendPct(0, 0)).toBeNull();
  });

  it("is null when last month nets to a refund (not above zero)", () => {
    expect(budgetTrendPct(12000, -500)).toBeNull();
  });

  it("is the whole-percent change against last month, positive when spending grew", () => {
    expect(budgetTrendPct(15000, 10000)).toBe(50);
    expect(budgetTrendPct(10000, 10000)).toBe(0);
  });

  it("is negative when spending fell, down to -100 at nothing spent", () => {
    expect(budgetTrendPct(7500, 10000)).toBe(-25);
    expect(budgetTrendPct(0, 10000)).toBe(-100);
  });

  it("rounds like Math.round: halves up toward +infinity", () => {
    expect(budgetTrendPct(10125, 10000)).toBe(1); // 1.25
    expect(budgetTrendPct(10150, 10000)).toBe(2); // 1.5
    expect(budgetTrendPct(9850, 10000)).toBe(-1); // -1.5
    expect(budgetTrendPct(20001, 3)).toBe(666600); // uncapped
  });
});
