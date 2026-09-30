import { describe, expect, it } from "vitest";
import { buildMobileHome, goalsPct, MOBILE_HOME_VERSION } from "./home";
import { testHome } from "./test-home";

describe("buildMobileHome", () => {
  const data = testHome();
  const home = buildMobileHome(data);

  it("has a stable, explicit top-level shape (changing it is a contract change)", () => {
    expect(MOBILE_HOME_VERSION).toBe(1);
    expect(Object.keys(home).sort()).toEqual(
      [
        "bankConnected",
        "breakdown",
        "budgeted",
        "categories",
        "currency",
        "income",
        "leftToSpend",
        "moneyLeft",
        "month",
        "recent",
        "savings",
        "savingsRate",
        "spent",
        "suggestion",
        "today",
        "trend",
        "trendChange",
        "version",
      ].sort(),
    );
  });

  it("takes every headline number straight from the authoritative dashboard tiles", () => {
    const t = data.view.tiles;
    expect(home.moneyLeft).toBe(t.netSavings);
    expect(home.income).toBe(t.income);
    expect(home.spent).toBe(t.spent);
    expect(home.budgeted).toBe(t.budgeted);
    expect(home.leftToSpend).toBe(t.leftToSpend);
    expect(home.savingsRate).toBe(t.savingsRate);
    // The fixture's own semantics: the transfer is not spending, the refund nets against Food.
    expect(home.spent).toBe(12345 - 2345 + 180000);
    expect(home.moneyLeft).toBe(home.income - home.spent);
  });

  it("carries the user's own month and today (from their time zone), not a device or server guess", () => {
    expect(home.month).toBe(data.month);
    expect(home.today).toBe(data.defaultDate);
  });

  it("passes the category bars through in the server's own order", () => {
    expect(home.categories.map((c) => c.id)).toEqual(data.view.bars.map((b) => b.categoryId));
    const food = home.categories.find((c) => c.id === "cat-food")!;
    const bar = data.view.bars.find((b) => b.categoryId === "cat-food")!;
    expect(food).toEqual({
      id: bar.categoryId,
      name: bar.name,
      color: bar.color,
      budget: bar.budget,
      actual: bar.actual,
      remaining: bar.remaining,
      pctUsed: bar.pctUsed,
      state: bar.state,
    });
  });

  it("summarises savings, or says null when there are no active goals", () => {
    expect(home.savings).toEqual({ activeCount: 1, totalSaved: 25000, totalTarget: 100000, pct: 25 });
    const none = buildMobileHome(testHome({ savings: { totalTarget: 0, totalSaved: 0, activeCount: 0, completeCount: 0 } }));
    expect(none.savings).toBeNull();
  });

  it("carries the goals' progress the web card prints: unrounded, and 0 without a target", () => {
    expect(goalsPct({ totalSaved: 1, totalTarget: 3 })).toBeCloseTo(33.333, 3);
    expect(goalsPct({ totalSaved: 150, totalTarget: 100 })).toBe(150);
    expect(goalsPct({ totalSaved: 500, totalTarget: 0 })).toBe(0);
    const noTarget = buildMobileHome(testHome({ savings: { totalTarget: 0, totalSaved: 500, activeCount: 1, completeCount: 0 } }));
    expect(noTarget.savings?.pct).toBe(0);
  });

  it("exposes recent activity without any raw row fields", () => {
    expect(home.recent).toEqual(data.recent);
    expect(Object.keys(home.recent[0]!).sort()).toEqual(
      ["amount", "category", "description", "direction", "id", "isTransfer", "occurredAt"].sort(),
    );
  });
});

describe("buildMobileHome: the spending cards (added 2026-09-29)", () => {
  it("prints the web cards' own figures: pickSuggestion, spendingBreakdown and trendChange over loadHome's data", async () => {
    const { pickSuggestion } = await import("@/lib/insights/suggestion");
    const { spendingBreakdown, trendChange } = await import("@/lib/insights/figures");
    const data = testHome();
    const home = buildMobileHome(data);
    expect(home.suggestion).toEqual(pickSuggestion(data.view.bars, data.prevView.bars, data.view.tiles.spent));
    expect(home.breakdown).toEqual(spendingBreakdown(data.view.bars, data.view.tiles.spent));
    expect(home.breakdown.reduce((s, b) => s + b.share, 0)).toBe(100);
    expect(home.trend).toEqual(data.trend);
    expect(home.trendChange).toEqual(trendChange(data.trend));
    expect(home.bankConnected).toBe(data.bankConnected);
  });
});
