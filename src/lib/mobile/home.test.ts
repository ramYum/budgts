import { describe, expect, it } from "vitest";
import { buildDemoDashboard } from "@/test-utils/demo-dashboard";
import type { MonthlyDashboard, RecentActivity } from "@/lib/budget/home-data";
import { buildMobileHome, MOBILE_HOME_VERSION } from "./home";

const NOW = new Date("2026-09-19T10:00:00Z");

function dashFromDemo(): MonthlyDashboard {
  const d = buildDemoDashboard(NOW);
  return {
    view: d.view,
    prevView: d.prevView,
    trend: d.trend,
    savings: d.savings,
    currency: d.currency,
    categories: d.categories,
    degraded: [],
  };
}

const recent: RecentActivity[] = [
  {
    id: "t1",
    amount: 3980,
    direction: "debit",
    occurredAt: "2026-09-16T12:00:00.000Z",
    description: "Whole Foods Market",
    isTransfer: false,
    category: { name: "Food / Groceries", color: "#3FA772" },
  },
];

describe("buildMobileHome", () => {
  const dash = dashFromDemo();
  const home = buildMobileHome({ month: "2026-09", dash, recent });

  it("has a stable, explicit top-level shape (changing it is a contract change)", () => {
    expect(MOBILE_HOME_VERSION).toBe(1);
    expect(Object.keys(home).sort()).toEqual(
      [
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
        "version",
      ].sort(),
    );
    expect(home.version).toBe(1);
  });

  it("takes every headline number straight from the authoritative dashboard tiles", () => {
    const t = dash.view.tiles;
    expect(home.moneyLeft).toBe(t.netSavings);
    expect(home.income).toBe(t.income);
    expect(home.spent).toBe(t.spent);
    expect(home.budgeted).toBe(t.budgeted);
    expect(home.leftToSpend).toBe(t.leftToSpend);
    expect(home.savingsRate).toBe(t.savingsRate);
    // …and never re-derives them: Money Left is income − spending by the domain's own math.
    expect(home.moneyLeft).toBe(home.income - home.spent);
  });

  it("passes the category bars through in the server's own order", () => {
    expect(home.categories.map((c) => c.id)).toEqual(dash.view.bars.map((b) => b.categoryId));
    expect(Object.keys(home.categories[0]!).sort()).toEqual(
      ["actual", "budget", "color", "id", "name", "pctUsed", "remaining", "state"].sort(),
    );
  });

  it("carries month, currency and recent activity through, exposing no other row fields", () => {
    expect(home.month).toBe("2026-09");
    expect(home.currency).toBe("USD");
    expect(home.recent).toEqual(recent);
    expect(Object.keys(home.recent[0]!).sort()).toEqual(
      ["amount", "category", "description", "direction", "id", "isTransfer", "occurredAt"].sort(),
    );
  });

  it("reports savings only when there is an active goal", () => {
    expect(home.savings).toEqual({
      activeCount: dash.savings.activeCount,
      totalSaved: dash.savings.totalSaved,
      totalTarget: dash.savings.totalTarget,
    });

    const none = buildMobileHome({
      month: "2026-09",
      dash: { ...dash, savings: { totalTarget: 0, totalSaved: 0, activeCount: 0, completeCount: 0 } },
      recent: [],
    });
    expect(none.savings).toBeNull();
  });

  it("keeps a null savings rate null (no income) rather than inventing 0", () => {
    const noIncome = buildMobileHome({
      month: "2026-09",
      dash: { ...dash, view: { ...dash.view, tiles: { ...dash.view.tiles, savingsRate: null } } },
      recent: [],
    });
    expect(noIncome.savingsRate).toBeNull();
  });
});
