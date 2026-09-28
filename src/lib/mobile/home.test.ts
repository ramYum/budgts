import { describe, expect, it } from "vitest";
import { buildMobileHome, MOBILE_HOME_VERSION } from "./home";
import { testHome } from "./test-home";

describe("buildMobileHome", () => {
  const data = testHome();
  const home = buildMobileHome(data);

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
        "today",
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
    expect(home.savings).toEqual({ activeCount: 1, totalSaved: 25000, totalTarget: 100000 });
    const none = buildMobileHome(testHome({ savings: { totalTarget: 0, totalSaved: 0, activeCount: 0, completeCount: 0 } }));
    expect(none.savings).toBeNull();
  });

  it("exposes recent activity without any raw row fields", () => {
    expect(home.recent).toEqual(data.recent);
    expect(Object.keys(home.recent[0]!).sort()).toEqual(
      ["amount", "category", "description", "direction", "id", "isTransfer", "occurredAt"].sort(),
    );
  });
});
